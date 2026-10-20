"""Recorded cash flows from current card records, with explicit cost coverage."""

import calendar
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from slabtrak.inventory import COST_FIELDS
from slabtrak.models import OwnedCopy

FinancialRange = Literal["all", "1y", "6m", "3m", "1m", "1w"]
ZERO = Decimal("0.00")


class Metric(BaseModel):
    amount: Decimal | None
    known_count: int
    complete_count: int
    total_count: int


class DailyFinances(BaseModel):
    date: date
    metrics: dict[str, Metric]


class CurrencyFinances(BaseModel):
    currency: str
    metrics: dict[str, Metric]
    undated_acquisitions: int
    undated_sales: int
    future_acquisitions: int
    future_sales: int
    series: list[DailyFinances]


class FinancialReport(BaseModel):
    range: FinancialRange
    as_of: date
    start_date: date | None
    end_date: date
    currencies: list[CurrencyFinances]


def range_start(period: FinancialRange, today: date) -> date | None:
    """Calendar month ranges clamp to month end; a week includes today and six days."""
    if period == "all":
        return None
    if period == "1w":
        return today - timedelta(days=6)
    months = {"1y": 12, "6m": 6, "3m": 3, "1m": 1}[period]
    month_index = today.year * 12 + today.month - 1 - months
    year, month = divmod(month_index, 12)
    month += 1
    return date(year, month, min(today.day, calendar.monthrange(year, month)[1]))


def metric(values: list[Decimal | None], complete_count: int | None = None) -> Metric:
    known = [value for value in values if value is not None]
    return Metric(
        amount=sum(known, ZERO) if known or not values else None,
        known_count=len(known),
        complete_count=len(known) if complete_count is None else complete_count,
        total_count=len(values),
    )


def acquisition_metric(cards: list[OwnedCopy]) -> Metric:
    costs = [[getattr(card, field) for field in COST_FIELDS] for card in cards]
    return metric(
        [
            sum((cost for cost in values if cost is not None), ZERO)
            if any(cost is not None for cost in values)
            else None
            for values in costs
        ],
        sum(all(cost is not None for cost in values) for values in costs),
    )


def cash_flow_metrics(acquisitions: list[OwnedCopy], sales: list[OwnedCopy]) -> dict[str, Metric]:
    nets = [card.sale_price - card.sale_fees for card in sales]
    complete_costs = [
        sum((getattr(card, field) for field in COST_FIELDS), ZERO)
        if all(getattr(card, field) is not None for field in COST_FIELDS)
        else None
        for card in sales
    ]
    return {
        "acquisition_spending": acquisition_metric(acquisitions),
        "gross_sales": metric([card.sale_price for card in sales]),
        "sale_fees": metric([card.sale_fees for card in sales]),
        "net_sales": metric(nets),
        "profit_vs_purchase": metric(
            [
                net - card.purchase_price if card.purchase_price is not None else None
                for card, net in zip(sales, nets, strict=True)
            ]
        ),
        "realized_profit": metric(
            [
                net - cost if cost is not None else None
                for net, cost in zip(nets, complete_costs, strict=True)
            ]
        ),
    }


def build_report(cards: list[OwnedCopy], period: FinancialRange, today: date) -> FinancialReport:
    start = range_start(period, today)

    def eligible(day: date | None) -> bool:
        if day is None:
            return start is None
        return day <= today and (start is None or day >= start)

    groups = defaultdict(list)
    for card in cards:
        groups[card.currency].append(card)
    currencies = []
    for currency, copies in sorted(groups.items()):
        acquisitions = [card for card in copies if eligible(card.acquired_on)]
        all_sales = [card for card in copies if card.sold]
        sales = [card for card in all_sales if eligible(card.sold_on)]
        metrics = cash_flow_metrics(acquisitions, sales)
        # Ownership is a current snapshot, including archived copies and undated costs.
        metrics["owned_cost"] = acquisition_metric([card for card in copies if not card.sold])
        acquisition_days = defaultdict(list)
        sale_days = defaultdict(list)
        for card in acquisitions:
            if card.acquired_on is not None:
                acquisition_days[card.acquired_on].append(card)
        for card in sales:
            if card.sold_on is not None:
                sale_days[card.sold_on].append(card)
        days = sorted(acquisition_days.keys() | sale_days.keys())
        currencies.append(
            CurrencyFinances(
                currency=currency,
                metrics=metrics,
                undated_acquisitions=sum(card.acquired_on is None for card in copies),
                undated_sales=sum(card.sold_on is None for card in all_sales),
                future_acquisitions=sum(
                    card.acquired_on is not None and card.acquired_on > today for card in copies
                ),
                future_sales=sum(
                    card.sold_on is not None and card.sold_on > today for card in all_sales
                ),
                series=[
                    DailyFinances(
                        date=day,
                        metrics=cash_flow_metrics(acquisition_days[day], sale_days[day]),
                    )
                    for day in days
                ],
            )
        )
    return FinancialReport(
        range=period, as_of=today, start_date=start, end_date=today, currencies=currencies
    )


def finances_router(db_session, authenticated) -> APIRouter:
    router = APIRouter(prefix="/api/finances")

    @router.get("", response_model=FinancialReport)
    def report(
        identity: Annotated[tuple, Depends(authenticated)],
        db: Annotated[Session, Depends(db_session)],
        period: Annotated[FinancialRange, Query(alias="range")] = "all",
    ):
        cards = list(db.scalars(select(OwnedCopy).where(OwnedCopy.owner_id == identity[0].id)))
        return build_report(cards, period, datetime.now(UTC).date())

    return router
