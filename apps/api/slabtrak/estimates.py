"""Conservative automatic estimates from private, manually recorded completed sales."""

import hashlib
import json
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from statistics import median
from typing import Annotated, Literal
from urllib.parse import urlsplit, urlunsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from slabtrak.models import ComparableSale, OwnedCopy

WINDOW_DAYS = 180
MINIMUM_SALES = 3
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class ComparableInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    sold_on: date
    price: PositiveMoney
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    condition: Literal["raw", "graded"] = "raw"
    grader: str = Field(default="", max_length=50)
    grade: str = Field(default="", max_length=20)
    source: str = Field(min_length=1, max_length=120)
    source_url: str = Field(default="", max_length=2048)

    @field_validator("source_url")
    @classmethod
    def safe_source(cls, value):
        if not value:
            return value
        try:
            parsed = urlsplit(value)
            if parsed.scheme not in {"https", "http"} or not parsed.hostname:
                raise ValueError("Use an HTTP or HTTPS source URL.")
            if parsed.username or parsed.password or any(char.isspace() for char in value):
                raise ValueError("Source URLs cannot include credentials or whitespace.")
            # Fragments do not identify a separate sale. URLs are stored, never fetched.
            return urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path, parsed.query, ""))
        except ValueError as error:
            raise ValueError("Use a valid HTTP or HTTPS source URL without credentials.") from error

    @model_validator(mode="after")
    def consistent_details(self):
        if self.sold_on > datetime.now(UTC).date():
            raise ValueError("A completed sale cannot be dated in the future.")
        if self.condition == "raw" and (self.grader or self.grade):
            raise ValueError("Raw completed sales cannot have grading details.")
        if self.condition == "graded" and not (self.grader and self.grade):
            raise ValueError("Record both grading company and grade for a graded sale.")
        return self


class ComparableOutput(ComparableInput):
    id: UUID
    definition_id: UUID
    created_at: datetime


class ComparableCreate(ComparableInput):
    expected_definition_id: UUID


class PriceObservation(BaseModel):
    sold_on: date
    price: Decimal


class Estimate(BaseModel):
    card_id: UUID
    currency: str
    condition: Literal["raw", "graded"]
    grader: str
    grade: str
    amount: Decimal | None
    low: Decimal | None
    high: Decimal | None
    sample_count: int
    latest_sale: date | None
    confidence: Literal["insufficient", "low", "medium"]
    reason: str
    history: list[PriceObservation] = Field(default_factory=list)


class EstimateList(BaseModel):
    as_of: date
    window_days: int = WINDOW_DAYS
    minimum_sales: int = MINIMUM_SALES
    items: list[Estimate]


class ComparableList(BaseModel):
    items: list[ComparableOutput]
    estimate: Estimate


def normalized_grade(value: str) -> str:
    """Treat numeric 9 and 9.0 as the same grade without inventing grade conversions."""
    value = value.strip().casefold()
    try:
        number = Decimal(value)
        return str(number.normalize()) if number.is_finite() else value
    except ArithmeticError:
        return value


def comparable_key(definition_id: UUID, data: ComparableInput) -> str:
    """Share duplicate detection between recorded sales and operator imports."""
    basis = data.source_url or json.dumps(
        (
            str(definition_id),
            data.sold_on.isoformat(),
            str(data.price.quantize(Decimal(".01"))),
            data.currency,
            data.condition,
            data.grader.casefold(),
            normalized_grade(data.grade),
            data.source.casefold(),
        )
    )
    return hashlib.sha256(basis.encode()).hexdigest()


def estimate_for(copy: OwnedCopy, sales: list[ComparableSale], today: date) -> Estimate:
    start = today - timedelta(days=WINDOW_DAYS - 1)
    history = [
        sale
        for sale in sales
        if sale.definition_id == copy.definition_id
        and sale.currency == copy.currency
        and sale.condition == copy.condition
        and sale.sold_on <= today
        and (
            copy.condition == "raw"
            or (
                copy.grade.strip()
                and sale.grader.casefold().strip() == copy.grader.casefold().strip()
                and normalized_grade(sale.grade) == normalized_grade(copy.grade)
            )
        )
    ]
    matched = [sale for sale in history if sale.sold_on >= start]
    prices = [sale.price for sale in matched]
    enough = len(prices) >= MINIMUM_SALES
    note = (
        "Raw condition is unverified; the observed range may include different conditions."
        if copy.condition == "raw"
        else "Only sales from the same grading company and grade are used."
    )
    reason = (
        (
            "Median of manually recorded completed sales; sources are not independently verified. "
            if enough
            else f"Needs {MINIMUM_SALES} matching sales within the last {WINDOW_DAYS} days. "
        )
        + note
        + " Other grades are context only; no grade multiplier is applied."
    )
    return Estimate(
        card_id=copy.id,
        currency=copy.currency,
        condition=copy.condition,
        grader=copy.grader,
        grade=copy.grade,
        amount=median(prices).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if enough else None,
        low=min(prices) if enough else None,
        high=max(prices) if enough else None,
        sample_count=len(prices),
        latest_sale=max((sale.sold_on for sale in matched), default=None),
        confidence=("medium" if copy.condition == "graded" and len(prices) >= 5 else "low")
        if enough
        else "insufficient",
        reason=reason,
        history=[
            PriceObservation(sold_on=sale.sold_on, price=sale.price.quantize(Decimal(".01")))
            for sale in sorted(history, key=lambda sale: (sale.sold_on, sale.price))
        ],
    )


def comparable_output(sale: ComparableSale) -> ComparableOutput:
    return ComparableOutput(
        **{name: getattr(sale, name) for name in ComparableInput.model_fields},
        id=sale.id,
        definition_id=sale.definition_id,
        created_at=sale.created_at,
    )


def estimates_router(db_session, authenticated, mutation) -> APIRouter:
    router = APIRouter(tags=["Market estimates"])
    DB = Annotated[Session, Depends(db_session)]
    Identity = Annotated[tuple, Depends(authenticated)]
    WriteIdentity = Annotated[tuple, Depends(mutation)]

    def owned(db, owner_id, card_id):
        copy = db.scalar(
            select(OwnedCopy).where(OwnedCopy.owner_id == owner_id, OwnedCopy.id == card_id)
        )
        if copy is None:
            raise HTTPException(404, "Card not found.")
        return copy

    def sales_for(db, owner_id, definition_id=None):
        statement = select(ComparableSale).where(ComparableSale.owner_id == owner_id)
        if definition_id is not None:
            statement = statement.where(ComparableSale.definition_id == definition_id)
        return list(
            db.scalars(statement.order_by(ComparableSale.sold_on.desc(), ComparableSale.id))
        )

    @router.get("/api/estimates", response_model=EstimateList)
    def list_estimates(db: DB, identity: Identity):
        today = datetime.now(UTC).date()
        copies = db.scalars(
            select(OwnedCopy)
            .where(OwnedCopy.owner_id == identity[0].id, OwnedCopy.sold.is_(False))
            .order_by(OwnedCopy.id)
        )
        sales = sales_for(db, identity[0].id)
        # Group once; no per-card database queries or cross-currency sums.
        by_definition: dict[UUID, list[ComparableSale]] = {}
        for sale in sales:
            by_definition.setdefault(sale.definition_id, []).append(sale)
        return EstimateList(
            as_of=today,
            items=[
                estimate_for(copy, by_definition.get(copy.definition_id, []), today)
                for copy in copies
            ],
        )

    @router.get("/api/cards/{card_id}/comparables", response_model=ComparableList)
    def list_comparables(card_id: UUID, db: DB, identity: Identity):
        copy = owned(db, identity[0].id, card_id)
        sales = sales_for(db, identity[0].id, copy.definition_id)
        return ComparableList(
            items=[comparable_output(sale) for sale in sales],
            estimate=estimate_for(copy, sales, datetime.now(UTC).date()),
        )

    @router.post(
        "/api/cards/{card_id}/comparables", response_model=ComparableOutput, status_code=201
    )
    def add_comparable(card_id: UUID, data: ComparableCreate, db: DB, identity: WriteIdentity):
        copy = owned(db, identity[0].id, card_id)
        if copy.definition_id != data.expected_definition_id:
            raise HTTPException(
                409,
                "This card's identity changed in another session. "
                "Reload the card before recording a completed sale.",
            )
        # A repeated source URL cannot inflate estimates, even on another card identity.
        sale = ComparableSale(
            owner_id=identity[0].id,
            definition_id=copy.definition_id,
            source_key=comparable_key(copy.definition_id, data),
            created_at=datetime.now(UTC),
            **data.model_dump(exclude={"expected_definition_id"}),
        )
        db.add(sale)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "This completed sale is already recorded.") from None
        return comparable_output(sale)

    @router.delete("/api/cards/{card_id}/comparables/{sale_id}", status_code=204)
    def delete_comparable(card_id: UUID, sale_id: UUID, db: DB, identity: WriteIdentity):
        copy = owned(db, identity[0].id, card_id)
        sale = db.scalar(
            select(ComparableSale).where(
                ComparableSale.id == sale_id,
                ComparableSale.owner_id == identity[0].id,
                ComparableSale.definition_id == copy.definition_id,
            )
        )
        if sale is None:
            raise HTTPException(404, "Completed sale not found.")
        db.delete(sale)
        db.commit()
        return Response(status_code=204)

    return router
