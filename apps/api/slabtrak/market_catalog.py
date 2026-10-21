"""Transient catalog drafts for review before adding a collection card."""

import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from slabtrak.market_values import MarketValues, as_uuid

RESULT_LIMIT = 20
REVIEW_NOTE = (
    "Review the card identity and parallel before saving. Catalog fields may be incomplete; "
    "a blank parallel does not confirm a base card. Search parallel labels are suggestions to "
    "review. Seasons use their starting year; review the complete release label. "
    "Search does not save a card or confirm prices."
)


class CatalogSearchInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")
    query: str = Field(min_length=4, max_length=200)

    @field_validator("query")
    @classmethod
    def plain_text(cls, value):
        if any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("Search must not contain control characters.")
        return value


class CatalogCardInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    card_id: UUID


class CatalogDraft(BaseModel):
    id: UUID
    subject: str
    year: int | None
    sport: str
    manufacturer: str
    set_name: str
    card_number: str
    parallel: str
    description: str = ""


def label(value, maximum):
    """Leave unusable identity fields blank instead of changing their meaning by truncation."""
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if len(value) > maximum or any(ord(char) < 32 or ord(char) == 127 for char in value):
        return ""
    return value


def draft(record, *, detail=False):
    if not isinstance(record, dict):
        return None
    card_id, subject = as_uuid(record.get("id")), label(record.get("name"), 200)
    if card_id is None or not subject:
        return None
    year_text = label(record.get("releaseYear" if detail else "year"), 20)
    # The collection stores the starting year, matching the existing valuation identity rule.
    season = re.fullmatch(r"(\d{4})(?:[-/]\d{2,4})?", year_text)
    year = int(season[1]) if season else None
    if year is not None and not 1800 <= year <= 2200:
        year = None
    release = label(record.get("releaseName"), 150)
    subset = label(record.get("setName"), 150)
    sport = label(record.get("segmentName"), 100) if not detail else ""
    if year is not None:
        release = re.sub(rf"^{re.escape(year_text)}\s+", "", release)
    if sport:
        release = re.sub(rf"\s+{re.escape(sport)}$", "", release, flags=re.I)
    # Retain release and subset context; "Base Set" alone loses the product identity.
    set_name = release or subset
    if release and subset and subset.casefold() not in {"base", "base set", release.casefold()}:
        set_name = label(f"{release} {subset}", 150)
    return CatalogDraft(
        id=card_id,
        subject=subject,
        year=year,
        sport=sport,
        manufacturer=label(record.get("manufacturerName"), 100) if not detail else "",
        set_name=set_name,
        card_number=label(record.get("number" if detail else "cardNumber"), 50),
        # Search parallelName is a relevance hint, never an exact market-link confirmation.
        parallel=label(record.get("parallelName"), 150) if not detail else "",
        description=label(record.get("description"), 1000),
    )


def market_catalog_router(authenticated, mutation, values: MarketValues):
    router = APIRouter(tags=["Card catalog"])
    Write = Annotated[tuple, Depends(mutation)]

    @router.post("/api/market/catalog/search")
    def search(data: CatalogSearchInput, identity: Write):
        # Documented at https://api.cardsight.ai/documentation/json (searchCatalog).
        payload = values.document(
            "/v1/catalog/search",
            {"q": data.query, "type": "card", "take": RESULT_LIMIT, "skip": 0},
        )
        records = payload.get("results")
        if not isinstance(records, list):
            raise HTTPException(502, "CardSight returned invalid catalog results.")
        items, seen = [], set()
        discarded = False
        for record in records[:RESULT_LIMIT]:
            item = (
                draft(record) if isinstance(record, dict) and record.get("type") == "card" else None
            )
            if item is None or item.id in seen:
                discarded = True
                continue
            seen.add(item.id)
            items.append(item)
        total = payload.get("total_count")
        more = (
            isinstance(total, (int, float)) and not isinstance(total, bool) and total > len(records)
        )
        return {
            "items": items,
            "truncated": more or len(records) >= RESULT_LIMIT,
            "note": REVIEW_NOTE
            + (" Some unusable or duplicate catalog results were omitted." if discarded else "")
            + (
                " CardSight returned a catalog advisory; refine the search if needed."
                if payload.get("messages")
                else ""
            ),
        }

    @router.post("/api/market/catalog/card")
    def selected_card(data: CatalogCardInput, identity: Write):
        record = values.document(f"/v1/catalog/cards/{data.card_id}")
        item = draft(record, detail=True)
        if item is None or item.id != data.card_id:
            raise HTTPException(502, "CardSight could not confirm the selected catalog card.")
        note = REVIEW_NOTE
        if record.get("isParallelOnly") or record.get("parallels") or record.get("parallelCount"):
            note += " This catalog entry has parallel variants; choose the parallel on your card."
        if record.get("variationOf"):
            note += " This entry is a variation; check its distinguishing details."
        return {"item": item, "note": note}

    return router
