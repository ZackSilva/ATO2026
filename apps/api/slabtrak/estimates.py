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

from slabtrak.models import ComparableSale, OwnedCopy, RawCondition
from slabtrak.urls import safe_image_url

WINDOW_DAYS = 180
MINIMUM_SALES = 3
STALE_AFTER_DAYS = 90
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class ComparableInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    sold_on: date
    price: PositiveMoney
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    condition: Literal["raw", "graded"] = "raw"
    raw_condition: RawCondition = "unspecified"
    grader: str = Field(default="", max_length=50)
    grade: str = Field(default="", max_length=20)
    source: str = Field(min_length=1, max_length=120)
    source_url: str = Field(default="", max_length=2048)
    image_url: str | None = Field(default=None, max_length=2048)

    @field_validator("image_url")
    @classmethod
    def safe_image(cls, value):
        if value is None:
            return None
        cleaned = safe_image_url(value)
        if not cleaned:
            raise ValueError("Use a public HTTPS listing-image URL without credentials.")
        return cleaned

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
        if self.condition == "graded" and self.raw_condition != "unspecified":
            raise ValueError("Raw condition categories apply only to raw completed sales.")
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
    raw_condition: RawCondition = "unspecified"
    grader: str
    grade: str
    amount: Decimal | None
    low: Decimal | None
    high: Decimal | None
    sample_count: int
    latest_sale: date | None
    latest_matching_sale: date | None = None
    days_since_latest_sale: int | None = None
    stale: bool = True
    confidence: Literal["insufficient", "low", "medium"]
    reason: str
    history: list[PriceObservation] = Field(default_factory=list)
    source: Literal["saved", "cardsight"] = "saved"
    pricing_status: Literal[
        "saved", "live", "insufficient", "unavailable", "pending", "mismatch"
    ] = "saved"
    fetched_at: datetime | None = None
    refresh_after: datetime | None = None
    pricing_note: str | None = None


class EstimateList(BaseModel):
    as_of: date
    window_days: int = WINDOW_DAYS
    minimum_sales: int = MINIMUM_SALES
    items: list[Estimate]


class SavedEvidence(BaseModel):
    items: list[ComparableOutput]
    matching_sale_ids: list[UUID]
    estimate: Estimate


class ComparableList(SavedEvidence):
    saved_history: SavedEvidence | None = None


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
    identity = (
        str(definition_id),
        data.sold_on.isoformat(),
        str(data.price.quantize(Decimal(".01"))),
        data.currency,
        data.condition,
        data.grader.casefold(),
        normalized_grade(data.grade),
        data.source.casefold(),
    )
    # Keep pre-condition-category hashes valid for existing saved evidence.
    if data.raw_condition != "unspecified":
        identity += (data.raw_condition,)
    basis = data.source_url or json.dumps(identity)
    return hashlib.sha256(basis.encode()).hexdigest()


def matching_sales(
    copy: OwnedCopy, sales: list[ComparableSale], today: date
) -> list[ComparableSale]:
    """Keep source identities attached to the exact observations used by card graphs."""
    raw_condition = copy.raw_condition or "unspecified"
    return [
        sale
        for sale in sales
        if sale.definition_id == copy.definition_id
        and sale.currency == copy.currency
        and sale.condition == copy.condition
        and sale.sold_on <= today
        and (
            (copy.condition == "raw" and (sale.raw_condition or "unspecified") == raw_condition)
            or (
                copy.condition == "graded"
                and copy.grade.strip()
                and sale.grader.casefold().strip() == copy.grader.casefold().strip()
                and normalized_grade(sale.grade) == normalized_grade(copy.grade)
            )
        )
    ]


def estimate_for(copy: OwnedCopy, sales: list[ComparableSale], today: date) -> Estimate:
    start = today - timedelta(days=WINDOW_DAYS - 1)
    raw_condition = copy.raw_condition or "unspecified"
    history = matching_sales(copy, sales, today)
    matched = [sale for sale in history if sale.sold_on >= start]
    prices = [sale.price for sale in matched]
    enough = len(prices) >= MINIMUM_SALES
    if copy.condition == "raw":
        note = (
            "Raw condition is unverified; only sales with unspecified raw condition are used."
            if raw_condition == "unspecified"
            else f"Only raw sales categorized as {raw_condition.replace('_', ' ')} are used; "
            "seller condition descriptions are not independently verified."
        )
    else:
        note = "Only sales from the same grading company and grade are used."
    latest_matching = max((sale.sold_on for sale in history), default=None)
    days_since_latest = (today - latest_matching).days if latest_matching else None
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
        raw_condition=raw_condition,
        grader=copy.grader,
        grade=copy.grade,
        amount=median(prices).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if enough else None,
        low=min(prices) if enough else None,
        high=max(prices) if enough else None,
        sample_count=len(prices),
        latest_sale=max((sale.sold_on for sale in matched), default=None),
        latest_matching_sale=latest_matching,
        days_since_latest_sale=days_since_latest,
        stale=days_since_latest is None or days_since_latest > STALE_AFTER_DAYS,
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


def estimates_router(db_session, authenticated, mutation, market_values=None) -> APIRouter:
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
        copies = list(
            db.scalars(
                select(OwnedCopy)
                .where(OwnedCopy.owner_id == identity[0].id, OwnedCopy.sold.is_(False))
                .order_by(OwnedCopy.id)
            )
        )
        sales = sales_for(db, identity[0].id)
        # Group once; no per-card database queries or cross-currency sums.
        by_definition: dict[UUID, list[ComparableSale]] = {}
        for sale in sales:
            by_definition.setdefault(sale.definition_id, []).append(sale)
        live = market_values.estimates(db, copies) if market_values else {}
        return EstimateList(
            as_of=today,
            items=[
                live.get(copy.id)
                or estimate_for(copy, by_definition.get(copy.definition_id, []), today)
                for copy in copies
            ],
        )

    @router.get("/api/cards/{card_id}/comparables", response_model=ComparableList)
    def list_comparables(card_id: UUID, db: DB, identity: Identity):
        copy = owned(db, identity[0].id, card_id)
        sales = sales_for(db, identity[0].id, copy.definition_id)
        today = datetime.now(UTC).date()
        saved = SavedEvidence(
            items=[comparable_output(sale) for sale in sales],
            matching_sale_ids=[sale.id for sale in matching_sales(copy, sales, today)],
            estimate=estimate_for(copy, sales, today),
        )
        if market_values:
            current = market_values.comparables(db, copy)
            if current is not None:
                return ComparableList(**current, saved_history=saved)
        return ComparableList(**saved.model_dump())

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
