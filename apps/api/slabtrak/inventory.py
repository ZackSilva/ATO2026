"""Owner-scoped inventory, exact acquisition costs, and revision-checked writes."""

import hashlib
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from slabtrak.models import CardDefinition, OwnedCopy, RawCondition
from slabtrak.photo_store import PhotoStore
from slabtrak.photos import prepare_photo

Money = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
Subgrade = Annotated[Decimal, Field(ge=0, le=10, max_digits=3, decimal_places=1)]
PhotoSide = Literal["front", "back"]
DEFINITION_FIELDS = (
    "subject",
    "year",
    "sport",
    "manufacturer",
    "set_name",
    "card_number",
    "parallel",
    "autograph",
    "memorabilia",
    "print_run",
)
COST_FIELDS = ("purchase_price", "shipping", "tax", "other_cost")
SALE_FIELDS = ("sold", "sale_price", "sale_fees", "sold_on")
CONFLICT = "This card changed in another session. Reload the card before editing again."


class CardInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    subject: str = Field(min_length=1, max_length=200)
    year: int | None = Field(default=None, ge=1800, le=2200)
    sport: str = Field(default="", max_length=100)
    manufacturer: str = Field(default="", max_length=100)
    set_name: str = Field(default="", max_length=150)
    card_number: str = Field(default="", max_length=50)
    parallel: str = Field(default="", max_length=150)
    autograph: bool = False
    memorabilia: bool = False
    print_run: int | None = Field(default=None, ge=1, le=2147483647)
    condition: Literal["raw", "graded"] = "raw"
    raw_condition: RawCondition = "unspecified"
    grader: str = Field(default="", max_length=50)
    grade: str = Field(default="", max_length=20)
    certification: str = Field(default="", max_length=100)
    centering: Subgrade | None = None
    corners: Subgrade | None = None
    edges: Subgrade | None = None
    surface: Subgrade | None = None
    serial_number: int | None = Field(default=None, ge=1, le=2147483647)
    purchase_price: Money | None = None
    shipping: Money | None = None
    tax: Money | None = None
    other_cost: Money | None = None
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    acquired_on: date | None = None
    seller: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=2000)
    archived: bool = False
    sold: bool = False
    sale_price: Money | None = None
    sale_fees: Money | None = None
    sold_on: date | None = None

    @model_validator(mode="after")
    def consistent_details(self):
        if self.serial_number is not None and self.print_run is not None:
            if self.serial_number > self.print_run:
                raise ValueError("Serial number must not exceed the print run.")
        grading = (self.grader, self.grade, self.certification)
        subgrades = (self.centering, self.corners, self.edges, self.surface)
        if self.condition == "raw" and (any(grading) or any(v is not None for v in subgrades)):
            raise ValueError("Raw cards cannot have grading details.")
        if self.condition == "graded" and not self.grader:
            raise ValueError("Choose a grading company for a graded card.")
        if self.condition == "graded" and self.raw_condition != "unspecified":
            raise ValueError("Raw condition categories apply only to raw cards.")
        if self.grader.upper() != "BGS" and any(v is not None for v in subgrades):
            raise ValueError("Subgrades are available for BGS cards.")
        if self.sold:
            if self.archived:
                raise ValueError("Sold cards cannot also be archived.")
            if self.sale_price is None or self.sale_fees is None:
                raise ValueError(
                    "Record a sale price and sale fees, including zero when applicable."
                )
        elif any(value is not None for value in (self.sale_price, self.sale_fees, self.sold_on)):
            raise ValueError("Unsold cards cannot have sale details.")
        return self


class CardUpdate(CardInput):
    revision: int = Field(ge=1)


class CardOutput(CardInput):
    id: UUID
    definition_id: UUID
    revision: int
    created_at: datetime
    updated_at: datetime
    recorded_cost: Decimal | None
    total_cost: Decimal | None
    sale_net: Decimal | None
    net_profit: Decimal | None
    profit_after_costs: Decimal | None
    photo_url: str | None
    photo_kind: Literal["upload", "reference"]
    photo_source: str
    back_photo_url: str | None
    back_photo_kind: Literal["upload", "reference"]
    back_photo_source: str


class Summary(BaseModel):
    active: int
    raw: int
    graded: int
    archived: int
    missing_price: int
    sold: int


class CardList(BaseModel):
    items: list[CardOutput]
    total: int
    summary: Summary


def definition_for(db: Session, owner_id: UUID, values: dict) -> CardDefinition:
    # Immutable identities prevent an edit to one copy from changing its siblings.
    fingerprint = hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()
    db.execute(
        insert(CardDefinition)
        .values(
            id=uuid4(),
            owner_id=owner_id,
            fingerprint=fingerprint,
            **values,
        )
        .on_conflict_do_nothing(index_elements=["owner_id", "fingerprint"])
    )
    return db.scalar(
        select(CardDefinition).where(
            CardDefinition.owner_id == owner_id,
            CardDefinition.fingerprint == fingerprint,
        )
    )


def output(copy: OwnedCopy, definition: CardDefinition) -> CardOutput:
    values = {name: getattr(definition, name) for name in DEFINITION_FIELDS}
    values.update(
        {
            name: getattr(copy, name)
            for name in CardInput.model_fields
            if name not in DEFINITION_FIELDS
        }
    )
    costs = [getattr(copy, name) for name in COST_FIELDS]
    known = [value for value in costs if value is not None]
    total_cost = sum(known, Decimal("0.00")) if len(known) == 4 else None
    # Keep sale responses at cents precision before and after a database reload.
    for name in ("sale_price", "sale_fees"):
        if values[name] is not None:
            values[name] = values[name].quantize(Decimal("0.00"))
    sale_net = values["sale_price"] - values["sale_fees"] if copy.sold else None
    return CardOutput(
        **values,
        id=copy.id,
        definition_id=copy.definition_id,
        revision=copy.revision,
        created_at=copy.created_at,
        updated_at=copy.updated_at,
        recorded_cost=sum(known, Decimal("0.00")) if known else None,
        total_cost=total_cost,
        sale_net=sale_net,
        net_profit=(
            sale_net - copy.purchase_price
            if sale_net is not None and copy.purchase_price is not None
            else None
        ),
        profit_after_costs=(
            sale_net - total_cost if sale_net is not None and total_cost is not None else None
        ),
        photo_url=f"/api/cards/{copy.id}/photo?v={copy.photo_key}" if copy.photo_key else None,
        photo_kind=copy.photo_kind,
        photo_source=copy.photo_source,
        back_photo_url=(
            f"/api/cards/{copy.id}/photo?side=back&v={copy.back_photo_key}"
            if copy.back_photo_key
            else None
        ),
        back_photo_kind=copy.back_photo_kind,
        back_photo_source=copy.back_photo_source,
    )


def inventory_router(db_session, authenticated, mutation, photos: PhotoStore) -> APIRouter:
    router = APIRouter(prefix="/api/cards", tags=["Inventory"])
    DB = Annotated[Session, Depends(db_session)]
    Identity = Annotated[tuple, Depends(authenticated)]
    WriteIdentity = Annotated[tuple, Depends(mutation)]

    def owned(db: Session, owner_id: UUID, card_id: UUID, *, lock=False):
        statement = (
            select(OwnedCopy, CardDefinition)
            .join(
                CardDefinition,
                (
                    (OwnedCopy.definition_id == CardDefinition.id)
                    & (OwnedCopy.owner_id == CardDefinition.owner_id)
                ),
            )
            .where(OwnedCopy.owner_id == owner_id, OwnedCopy.id == card_id)
        )
        if lock:
            statement = statement.with_for_update(of=OwnedCopy)
        row = db.execute(statement).first()
        if row is None:
            raise HTTPException(404, "Card not found.")
        return row

    @router.get("", response_model=CardList)
    def list_cards(
        db: DB,
        identity: Identity,
        q: str = Query(default="", max_length=200),
        condition: Literal["all", "raw", "graded"] = "all",
        status: Literal["active", "archived", "sold", "all"] = "active",
        sort: Literal["newest", "subject", "year"] = "newest",
        offset: int = Query(default=0, ge=0),
        limit: int = Query(default=24, ge=1, le=100),
    ):
        owner_id = identity[0].id
        statement = (
            select(OwnedCopy, CardDefinition)
            .join(
                CardDefinition,
                (
                    (OwnedCopy.definition_id == CardDefinition.id)
                    & (OwnedCopy.owner_id == CardDefinition.owner_id)
                ),
            )
            .where(OwnedCopy.owner_id == owner_id)
        )
        if status == "sold":
            statement = statement.where(OwnedCopy.sold)
        elif status != "all":
            statement = statement.where(
                ~OwnedCopy.sold, OwnedCopy.archived == (status == "archived")
            )
        if condition != "all":
            statement = statement.where(OwnedCopy.condition == condition)
        if q.strip():
            statement = statement.where(
                or_(
                    *(
                        column.icontains(q.strip(), autoescape=True)
                        for column in (
                            CardDefinition.subject,
                            CardDefinition.sport,
                            CardDefinition.manufacturer,
                            CardDefinition.set_name,
                            CardDefinition.card_number,
                            CardDefinition.parallel,
                            OwnedCopy.grader,
                            OwnedCopy.certification,
                            OwnedCopy.notes,
                            OwnedCopy.seller,
                        )
                    )
                )
            )
        total = db.scalar(select(func.count()).select_from(statement.subquery()))
        ordering = {
            "newest": OwnedCopy.created_at.desc(),
            "subject": func.lower(CardDefinition.subject).asc(),
            "year": CardDefinition.year.desc().nulls_last(),
        }[sort]
        rows = db.execute(statement.order_by(ordering, OwnedCopy.id).offset(offset).limit(limit))
        counts = db.execute(
            select(
                func.count().filter(~OwnedCopy.archived, ~OwnedCopy.sold),
                func.count().filter(
                    ~OwnedCopy.archived, ~OwnedCopy.sold, OwnedCopy.condition == "raw"
                ),
                func.count().filter(
                    ~OwnedCopy.archived, ~OwnedCopy.sold, OwnedCopy.condition == "graded"
                ),
                func.count().filter(OwnedCopy.archived, ~OwnedCopy.sold),
                func.count().filter(
                    ~OwnedCopy.archived, ~OwnedCopy.sold, OwnedCopy.purchase_price.is_(None)
                ),
                func.count().filter(OwnedCopy.sold),
            ).where(OwnedCopy.owner_id == owner_id)
        ).one()
        return CardList(
            items=[output(*row) for row in rows],
            total=total,
            summary=Summary(**dict(zip(Summary.model_fields, counts, strict=True))),
        )

    @router.get("/{card_id}", response_model=CardOutput)
    def get_card(card_id: UUID, db: DB, identity: Identity):
        return output(*owned(db, identity[0].id, card_id))

    @router.get("/{card_id}/photo", response_class=Response)
    def get_photo(
        card_id: UUID, db: DB, identity: Identity, side: Annotated[PhotoSide, Query()] = "front"
    ):
        copy, _ = owned(db, identity[0].id, card_id)
        key = copy.back_photo_key if side == "back" else copy.photo_key
        if not key:
            raise HTTPException(404, "No photo is attached to this card.")
        payload = photos.read(copy.owner_id, key)
        return Response(payload, media_type="image/jpeg")

    @router.put("/{card_id}/photo", response_model=CardOutput)
    def upload_photo(
        card_id: UUID,
        db: DB,
        identity: WriteIdentity,
        payload: Annotated[bytes, Body(media_type="application/octet-stream")],
        revision: int = Query(ge=1),
        side: Annotated[PhotoSide, Query()] = "front",
    ):
        copy, definition = owned(db, identity[0].id, card_id, lock=True)
        if copy.revision != revision:
            raise HTTPException(409, CONFLICT)
        image = prepare_photo(payload)
        prefix = "back_" if side == "back" else ""
        previous, key = getattr(copy, f"{prefix}photo_key"), uuid4()
        owner_id = copy.owner_id
        photos.write(owner_id, key, image)
        setattr(copy, f"{prefix}photo_key", key)
        setattr(copy, f"{prefix}photo_kind", "upload")
        setattr(copy, f"{prefix}photo_source", "")
        copy.updated_at = datetime.now(UTC)
        try:
            db.commit()
        except Exception:
            db.rollback()
            photos.remove(owner_id, key)
            raise
        photos.remove(copy.owner_id, previous)
        return output(copy, definition)

    @router.delete("/{card_id}/photo", response_model=CardOutput)
    def delete_photo(
        card_id: UUID,
        db: DB,
        identity: WriteIdentity,
        revision: int = Query(ge=1),
        side: Annotated[PhotoSide, Query()] = "front",
    ):
        copy, definition = owned(db, identity[0].id, card_id, lock=True)
        if copy.revision != revision:
            raise HTTPException(409, CONFLICT)
        prefix = "back_" if side == "back" else ""
        previous = getattr(copy, f"{prefix}photo_key")
        setattr(copy, f"{prefix}photo_key", None)
        setattr(copy, f"{prefix}photo_kind", "upload")
        setattr(copy, f"{prefix}photo_source", "")
        copy.updated_at = datetime.now(UTC)
        db.commit()
        photos.remove(copy.owner_id, previous)
        return output(copy, definition)

    @router.post("", response_model=CardOutput, status_code=201)
    def create_card(data: CardInput, db: DB, identity: WriteIdentity):
        values = data.model_dump()
        definition = definition_for(
            db, identity[0].id, {name: values.pop(name) for name in DEFINITION_FIELDS}
        )
        now = datetime.now(UTC)
        copy = OwnedCopy(
            owner_id=identity[0].id,
            definition_id=definition.id,
            created_at=now,
            updated_at=now,
            **values,
        )
        db.add(copy)
        db.commit()
        return output(copy, definition)

    @router.put("/{card_id}", response_model=CardOutput)
    def update_card(card_id: UUID, data: CardUpdate, db: DB, identity: WriteIdentity):
        copy, _ = owned(db, identity[0].id, card_id, lock=True)
        if copy.revision != data.revision:
            raise HTTPException(409, CONFLICT)
        values = data.model_dump(exclude={"revision"})
        if "raw_condition" not in data.model_fields_set and data.condition == "raw":
            values["raw_condition"] = copy.raw_condition
        # Older clients do not send sale fields; metadata edits must retain a recorded sale.
        if not set(SALE_FIELDS).intersection(data.model_fields_set):
            values.update({name: getattr(copy, name) for name in SALE_FIELDS})
            if values["sold"] and values["archived"]:
                raise HTTPException(422, "Sold cards cannot also be archived.")
        definition = definition_for(
            db, identity[0].id, {name: values.pop(name) for name in DEFINITION_FIELDS}
        )
        copy.definition_id = definition.id
        for name, value in values.items():
            setattr(copy, name, value)
        copy.updated_at = datetime.now(UTC)
        try:
            db.commit()
        except StaleDataError:
            db.rollback()
            raise HTTPException(409, CONFLICT) from None
        return output(copy, definition)

    @router.delete("/{card_id}", status_code=204)
    def delete_card(card_id: UUID, db: DB, identity: WriteIdentity, revision: int = Query(ge=1)):
        copy, _ = owned(db, identity[0].id, card_id, lock=True)
        if copy.revision != revision:
            raise HTTPException(409, CONFLICT)
        db.delete(copy)
        previous = (copy.photo_key, copy.back_photo_key)
        try:
            db.commit()
        except StaleDataError:
            db.rollback()
            raise HTTPException(409, CONFLICT) from None
        for key in previous:
            photos.remove(copy.owner_id, key)

    return router
