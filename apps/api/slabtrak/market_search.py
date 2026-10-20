"""Authenticated, transient auction searches; provider records never enter collection storage."""

import calendar
import hashlib
import json
import re
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from slabtrak.config import Settings
from slabtrak.estimates import normalized_grade
from slabtrak.urls import safe_image_url, safe_url

ENDPOINT = "https://api.cardsight.ai/v1/pricing/search"
RESULT_LIMIT = 100
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
NOTICE = (
    "CardSight-reported completed auctions, not independently verified. Search matches can "
    "include different cards or variants; review each listing. Results are not saved or used "
    "as collection estimates. Prices are USD; shipping, tax and buyer premiums may differ."
)
GRADED_TITLE = re.compile(
    r"\b(?:PSA|BGS|SGC|CGC|CSG|BVG|HGA|GMA|TAG|KSA|graded|authenticated)\b", re.I
)


class MarketSearchInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    query: str = Field(min_length=4, max_length=200)
    period: Literal["all", "1y", "6m", "3m", "1m", "1w"] = "6m"
    condition: Literal["all", "raw", "graded"] = "all"
    grader: str = Field(default="", max_length=50)
    grade: str = Field(default="", max_length=20)

    @model_validator(mode="after")
    def coherent_filters(self):
        if self.condition != "graded" and (self.grader or self.grade):
            raise ValueError("Grade filters require graded condition.")
        if any(ord(char) < 32 or ord(char) == 127 for char in self.query):
            raise ValueError("Search must not contain control characters.")
        return self


class MatchedCard(BaseModel):
    name: str
    number: str | None
    set_name: str
    year: str


class MarketSale(BaseModel):
    id: str
    title: str
    price: Decimal
    currency: Literal["USD"] = "USD"
    sold_on: date
    source: str
    source_url: str
    image_url: str | None
    condition: Literal["raw", "graded", "unknown"]
    grader: str
    grade: str
    parallel: str | None
    matched_card: MatchedCard | None


class MarketSearchOutput(BaseModel):
    query: str
    provider: Literal["cardsight"] = "cardsight"
    fetched_at: datetime
    items: list[MarketSale]
    discarded_count: int
    returned_count: int
    truncated: bool
    notice: str = NOTICE


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        # Never forward the API credential to a redirect destination.
        return None


def fetch_payload(key: str, search: MarketSearchInput) -> dict:
    params = urlencode(
        {
            "q": search.query,
            "period": "7d" if search.period == "1w" else search.period,
            "listing_type": "auction",
            "limit": RESULT_LIMIT,
        }
    )
    request = Request(
        f"{ENDPOINT}?{params}",
        headers={"X-API-Key": key, "Accept": "application/json"},
    )
    try:
        with build_opener(NoRedirects()).open(request, timeout=10) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as error:
        if error.code == 429:
            raise HTTPException(429, "CardSight search limit reached. Try again later.") from None
        if error.code in (401, 403):
            raise HTTPException(
                502, "CardSight rejected the server API key. Check its account access."
            ) from None
        raise HTTPException(502, "CardSight search is temporarily unavailable.") from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise HTTPException(503, "CardSight could not be reached. Try again later.") from None
    if len(body) > MAX_RESPONSE_BYTES:
        raise HTTPException(502, "CardSight returned an oversized response.")
    try:
        payload = json.loads(body, parse_float=Decimal)
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise HTTPException(502, "CardSight returned an invalid response.") from None
    if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
        raise HTTPException(502, "CardSight returned an invalid response.")
    return payload


def text_field(value, maximum: int = 500) -> str:
    return value.strip()[:maximum] if isinstance(value, str) else ""


def period_start(today: date, period: str) -> date | None:
    if period == "all":
        return None
    if period == "1w":
        return today - timedelta(days=6)
    months = {"1m": 1, "3m": 3, "6m": 6, "1y": 12}[period]
    month_index = today.year * 12 + today.month - 1 - months
    year, month = divmod(month_index, 12)
    month += 1
    return date(year, month, min(today.day, calendar.monthrange(year, month)[1]))


def parse_sale(record: dict, today: date) -> MarketSale | None:
    if not isinstance(record, dict) or record.get("listing_type") != "auction":
        return None
    # The provider documents all search prices in USD. Reject any contradictory currency.
    if record.get("currency", "USD") != "USD":
        return None
    try:
        price = Decimal(str(record.get("price")))
        if not price.is_finite() or price <= 0 or price >= Decimal("10000000000"):
            return None
        if price != price.quantize(Decimal("0.01")):
            return None
        price = price.quantize(Decimal("0.01"))
        timestamp = record.get("date")
        if not isinstance(timestamp, str):
            return None
        # Parse the full timestamp rather than accepting a valid prefix with invalid suffix.
        sold_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        sold_on = sold_at.astimezone(UTC).date() if sold_at.tzinfo else sold_at.date()
        if sold_on > today:
            return None
    except (ValueError, TypeError, InvalidOperation, OverflowError):
        return None
    title = text_field(record.get("title")) or "Untitled auction"
    context = record.get("grade")
    grader = text_field(context.get("company_name"), 50) if isinstance(context, dict) else ""
    grade = text_field(context.get("grade_value"), 20) if isinstance(context, dict) else ""
    if grader and grade:
        condition = "graded"
    elif context is not None or GRADED_TITLE.search(title):
        condition, grader, grade = "unknown", "", ""
    else:
        # The schema explicitly describes omitted grade as an ungraded listing.
        condition, grader, grade = "raw", "", ""
    source = text_field(record.get("source"), 120) or "CardSight"
    source_url = safe_url(record.get("url"))
    matched = record.get("matched_card")
    matched_card = None
    if isinstance(matched, dict) and isinstance(matched.get("set"), dict):
        matched_card = MatchedCard(
            name=text_field(matched.get("name")),
            number=text_field(matched.get("number"), 100) or None,
            set_name=text_field(matched["set"].get("name")),
            year=text_field(matched["set"].get("year"), 20),
        )
    identity = source_url or json.dumps([title, str(price), str(sold_on), source])
    return MarketSale(
        id=hashlib.sha256(identity.encode()).hexdigest(),
        title=title,
        price=price,
        sold_on=sold_on,
        source=source,
        source_url=source_url,
        image_url=safe_image_url(record.get("image_url")),
        condition=condition,
        grader=grader,
        grade=grade,
        parallel=text_field(record.get("parallel_name"), 200) or None,
        matched_card=matched_card,
    )


def search_sales(payload: dict, search: MarketSearchInput, now: datetime) -> MarketSearchOutput:
    records = payload.get("results")
    if not isinstance(records, list):
        raise HTTPException(502, "CardSight returned an invalid response.")
    items, seen = [], set()
    cutoff = period_start(now.date(), search.period)
    for record in records[:RESULT_LIMIT]:
        sale = parse_sale(record, now.date())
        if (
            sale is None
            or sale.id in seen
            or (cutoff and sale.sold_on < cutoff)
            or (search.condition != "all" and sale.condition != search.condition)
            or (search.grader and sale.grader.casefold() != search.grader.casefold())
            or (search.grade and normalized_grade(sale.grade) != normalized_grade(search.grade))
        ):
            continue
        seen.add(sale.id)
        items.append(sale)
    return MarketSearchOutput(
        query=search.query,
        fetched_at=now,
        items=items,
        returned_count=len(items),
        discarded_count=len(records[:RESULT_LIMIT]) - len(items),
        truncated=len(records) >= RESULT_LIMIT,
    )


def market_search_router(settings: Settings, authenticated, mutation):
    router = APIRouter()

    @router.get("/api/market/status")
    def status(identity: Annotated[tuple, Depends(authenticated)]):
        return {"provider": "cardsight", "configured": bool(settings.cardsight_api_key)}

    @router.post("/api/market/search", response_model=MarketSearchOutput)
    def search(data: MarketSearchInput, identity: Annotated[tuple, Depends(mutation)]):
        if not settings.cardsight_api_key:
            raise HTTPException(503, "Configure CARDSIGHT_API_KEY on the server to search sales.")
        payload = fetch_payload(settings.cardsight_api_key.get_secret_value(), data)
        return search_sales(payload, data, datetime.now(UTC))

    return router
