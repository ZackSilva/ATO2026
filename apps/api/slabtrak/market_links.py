"""Owner-scoped confirmation of provider references, separate from collection transactions."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from slabtrak.market_values import now_utc, signature
from slabtrak.models import CardDefinition, MarketLink, OwnedCopy


class MatchVersion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_definition_id: UUID


class MatchChange(MatchVersion):
    expected_card_id: UUID | None
    expected_confirmed_at: datetime | None = None


class ConfirmMatch(MatchChange):
    card_id: UUID
    grade_id: UUID | None = None


def market_links_router(db_session, authenticated, mutation, values):
    router = APIRouter(tags=["Automatic valuations"])
    DB = Annotated[object, Depends(db_session)]
    Read = Annotated[tuple, Depends(authenticated)]
    Write = Annotated[tuple, Depends(mutation)]

    def owned(db, owner_id, card_id, definition_id=None, lock=False):
        query = select(OwnedCopy).where(OwnedCopy.id == card_id, OwnedCopy.owner_id == owner_id)
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        copy = db.scalar(query)
        if copy is None:
            raise HTTPException(404, "Card not found.")
        if definition_id is not None and copy.definition_id != definition_id:
            raise HTTPException(409, "Card identity changed. Reload before confirming a match.")
        return copy

    def status(copy, link):
        return {
            "configured": bool(values.settings.cardsight_api_key),
            "link": None
            if link is None
            else {
                "card_id": link.provider_card_id,
                "parallel_id": link.provider_parallel_id,
                "grade_id": link.provider_grade_id,
                "confirmed_at": link.confirmed_at,
                "valid": signature(copy) == link.copy_signature,
            },
        }

    @router.get("/api/cards/{card_id}/market-link")
    def get_link(card_id: UUID, db: DB, identity: Read):
        copy = owned(db, identity[0].id, card_id)
        return status(copy, db.get(MarketLink, copy.id))

    @router.post("/api/cards/{card_id}/market-link/candidates")
    def candidates(card_id: UUID, data: MatchVersion, db: DB, identity: Write):
        copy = owned(db, identity[0].id, card_id, data.expected_definition_id)
        return values.candidates(db, copy)

    @router.post("/api/cards/{card_id}/market-link")
    def confirm(card_id: UUID, data: ConfirmMatch, db: DB, identity: Write):
        copy = owned(db, identity[0].id, card_id, data.expected_definition_id)
        # Re-read catalog details instead of trusting a client-supplied candidate label.
        detail = values.document(f"/v1/catalog/cards/{data.card_id}")
        if str(detail.get("id")) != str(data.card_id):
            raise HTTPException(422, "The provider card identity could not be confirmed.")
        candidate = values.verified_candidate(db.get(CardDefinition, copy.definition_id), detail)
        if not candidate["eligible"]:
            raise HTTPException(422, candidate["reason"])
        if copy.condition == "graded":
            options = values.grade_options(copy)
            if str(data.grade_id) not in {option["id"] for option in options}:
                raise HTTPException(422, "Choose the matching grading company, label and grade.")
        elif data.grade_id is not None:
            raise HTTPException(422, "Raw cards cannot be linked to a grading label.")
        before_signature = signature(copy)
        # The copied identity can change while a provider request is in flight.
        copy = owned(db, identity[0].id, card_id, data.expected_definition_id, lock=True)
        if signature(copy) != before_signature:
            raise HTTPException(409, "Card grading changed. Reload before confirming a match.")
        link = db.get(MarketLink, copy.id)
        if (link.provider_card_id if link else None) != data.expected_card_id or (
            link is not None and link.confirmed_at != data.expected_confirmed_at
        ):
            raise HTTPException(409, "The market match changed in another session. Reload first.")
        if link is None:
            link = MarketLink(copy_id=copy.id)
            db.add(link)
        link.provider_card_id = data.card_id
        link.provider_parallel_id = (
            UUID(candidate["parallel_id"]) if candidate["parallel_id"] else None
        )
        link.provider_grade_id = data.grade_id
        link.copy_signature = signature(copy)
        link.confirmed_at = now_utc()
        db.commit()
        return status(copy, link)

    @router.delete("/api/cards/{card_id}/market-link")
    def unlink(card_id: UUID, data: MatchChange, db: DB, identity: Write):
        copy = owned(db, identity[0].id, card_id, data.expected_definition_id, lock=True)
        link = db.get(MarketLink, copy.id)
        if (link.provider_card_id if link else None) != data.expected_card_id or (
            link is not None and link.confirmed_at != data.expected_confirmed_at
        ):
            raise HTTPException(409, "The market match changed in another session. Reload first.")
        if link is not None:
            db.delete(link)
            db.commit()
        return status(copy, None)

    @router.post("/api/cards/{card_id}/market-link/refresh")
    def refresh(card_id: UUID, db: DB, identity: Write):
        copy = owned(db, identity[0].id, card_id)
        if db.get(MarketLink, copy.id) is None:
            raise HTTPException(409, "Confirm an exact card match before refreshing prices.")
        current = values.comparables(db, copy, force=True)
        if current is None:
            raise HTTPException(409, "The market match was removed. Reload the card.")
        return {"estimate": current["estimate"]}

    return router
