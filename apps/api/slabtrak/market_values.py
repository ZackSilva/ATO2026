"""Exact-card prices with bounded, expiring application caches and no sale-data writes."""

import hashlib
import json
import re
import time
from collections import OrderedDict, defaultdict
from datetime import UTC, datetime, timedelta
from threading import RLock
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, build_opener
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException
from sqlalchemy import select

from slabtrak.estimates import ComparableOutput, estimate_for, matching_sales, normalized_grade
from slabtrak.market_search import MAX_RESPONSE_BYTES, NoRedirects, parse_sale
from slabtrak.models import CardDefinition, MarketLink, OwnedCopy

MAX_CACHE_AGE = timedelta(hours=24)
REFERENCE_CACHE_AGE = timedelta(minutes=30)
RETRY_DELAY = timedelta(minutes=1)
MAX_CACHE_ENTRIES = 128
MAX_REFRESH_GROUPS = 3
_REQUEST_LOCK = RLock()
_last_request = 0.0


def now_utc():
    return datetime.now(UTC)


def fetch_json(key, path, params=None, body=None):
    """Call fixed provider routes, cap responses, and never forward a key through redirects."""
    global _last_request
    url = "https://api.cardsight.ai" + path
    if params:
        url += "?" + urlencode(params)
    request = Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "X-API-Key": key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with _REQUEST_LOCK:
            time.sleep(max(0, 0.3 - (time.monotonic() - _last_request)))
            _last_request = time.monotonic()
            with build_opener(NoRedirects()).open(request, timeout=8) as response:
                data = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as failure:
        if failure.code == 429:
            raise HTTPException(
                429, "CardSight request limit reached. Prices will retry later."
            ) from None
        if failure.code in (401, 403):
            raise HTTPException(502, "CardSight rejected its configured account access.") from None
        raise HTTPException(502, "CardSight could not return prices or card details.") from None
    except (URLError, OSError, ValueError):
        raise HTTPException(
            503, "CardSight could not be reached. Prices will retry later."
        ) from None
    if len(data) > MAX_RESPONSE_BYTES:
        raise HTTPException(502, "CardSight returned an oversized response.")
    try:
        result = json.loads(data, parse_float=str)
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise HTTPException(502, "CardSight returned an invalid response.") from None
    if not isinstance(result, dict):
        raise HTTPException(502, "CardSight returned an invalid response.")
    return result


def normalized(value):
    return " ".join(re.findall(r"\w+", str(value or "").casefold()))


def as_uuid(value):
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


def signature(copy):
    values = [
        str(copy.definition_id),
        copy.currency,
        copy.condition,
        copy.raw_condition,
        copy.grader.strip().casefold(),
        normalized_grade(copy.grade),
    ]
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()


class MarketValues:
    def __init__(self, settings):
        self.settings = settings
        self.lock = RLock()
        self.documents = OrderedDict()
        self.prices = OrderedDict()
        self.errors = {}
        self.retry_after = None

    def key(self):
        if not self.settings.cardsight_api_key:
            raise HTTPException(
                503, "Connect CardSight before matching a card or refreshing prices."
            )
        return self.settings.cardsight_api_key.get_secret_value()

    def clear(self):
        with self.lock:
            self.documents.clear()
            self.prices.clear()
            self.errors.clear()
            self.retry_after = None

    def purge(self):
        with self.lock:
            now = now_utc()
            for cache in (self.documents, self.prices):
                for key, item in list(cache.items()):
                    if item["expires_at"] <= now:
                        del cache[key]
            self.errors = {key: item for key, item in self.errors.items() if item[0] > now}

    def document(self, path, params=None):
        with self.lock:
            self.purge()
            key = (path, json.dumps(params, sort_keys=True))
            cached = self.documents.get(key)
            if cached:
                return cached["data"]
            result = fetch_json(self.key(), path, params)
            self.documents[key] = {"data": result, "expires_at": now_utc() + REFERENCE_CACHE_AGE}
            while len(self.documents) > MAX_CACHE_ENTRIES:
                self.documents.popitem(last=False)
            return result

    def candidate(self, definition, card):
        """A partial catalog search only proposes candidates; strict fields gate confirmation."""
        reasons = []
        card_id = as_uuid(card.get("id"))
        if card_id is None:
            reasons.append("Missing catalog identity.")
        if normalized(card.get("name")) != normalized(definition.subject):
            reasons.append("Subject differs.")
        year = str(card.get("releaseYear", ""))
        if definition.year is None or not re.fullmatch(
            rf"{definition.year}(?:[-/]\d{{2,4}})?", year
        ):
            reasons.append("Release year differs or is missing.")
        if not definition.card_number or normalized(card.get("number")) != normalized(
            definition.card_number
        ):
            reasons.append("Card number differs or is missing.")
        release, set_name = str(card.get("releaseName", "")), str(card.get("setName", ""))
        expected_set = normalized(definition.set_name)
        release_core = normalized(re.sub(r"^\d{4}(?:[-/]\d{2,4})?\s*", "", release))
        sport = normalized(definition.sport)
        if sport and release_core.endswith(" " + sport):
            release_core = release_core[: -(len(sport) + 1)]
        valid_releases = {
            expected_set,
            normalized(definition.manufacturer + " " + definition.set_name),
        }
        base_subset = normalized(set_name) in {"base", "base set"}
        exact_product = release_core in valid_releases and base_subset
        exact_subset = normalized(release_core + " " + set_name) in valid_releases
        if not expected_set or not (exact_product or exact_subset):
            reasons.append(
                "Exact release and subset must agree; a generic set name is insufficient."
            )
        if card.get("variationOf"):
            reasons.append("This is a separate variation; its identity needs additional review.")
        if definition.manufacturer and normalized(definition.manufacturer) not in normalized(
            release + " " + set_name
        ):
            reasons.append("Manufacturer is not confirmed by this release.")
        # Sparse catalog attributes cannot verify autograph/relic/limited-print specifications.
        if definition.autograph or definition.memorabilia:
            reasons.append("Autograph or relic identity needs additional provider support.")
        parallel_id = None
        if definition.parallel:
            parallels = card.get("parallels", [])
            if not isinstance(parallels, list):
                parallels = []
                reasons.append("Parallel catalog details are invalid.")
            matches = [
                p
                for p in parallels
                if isinstance(p, dict)
                and normalized(p.get("name")) == normalized(definition.parallel)
                and as_uuid(p.get("id"))
            ]
            if len(matches) != 1:
                reasons.append("The exact parallel is not uniquely identified.")
            else:
                parallel_id = str(as_uuid(matches[0]["id"]))
                if matches[0].get("isPartial"):
                    applicable = matches[0].get("cards", [])
                    if not isinstance(applicable, list) or card_id not in {
                        as_uuid(value) for value in applicable
                    }:
                        reasons.append("This partial parallel does not include the selected card.")
                if definition.print_run and matches[0].get("numberedTo") != definition.print_run:
                    reasons.append("Parallel print run differs or is not confirmed.")
        elif card.get("isParallelOnly"):
            reasons.append("This catalog card has no base version.")
        if (
            definition.print_run
            and not definition.parallel
            and card.get("numberedTo") != definition.print_run
        ):
            reasons.append("Base print run differs or is not confirmed.")
        return {
            "id": str(card_id) if card_id else "",
            "name": str(card.get("name", ""))[:200],
            "number": card.get("number"),
            "release_name": release[:250],
            "year": year[:20],
            "set_name": set_name[:150],
            "parallel_id": parallel_id,
            "parallel_name": definition.parallel or None,
            "eligible": not reasons,
            "reason": " ".join(reasons),
        }

    @staticmethod
    def objects(value, maximum=1000):
        if (
            not isinstance(value, list)
            or len(value) > maximum
            or any(not isinstance(row, dict) for row in value)
        ):
            raise HTTPException(502, "CardSight returned invalid reference data.")
        return value

    def verified_candidate(self, definition, card):
        result = self.candidate(definition, card)
        if not result["eligible"]:
            return result
        release_id = as_uuid(card.get("releaseId"))
        if release_id is None:
            result.update(eligible=False, reason="The release identity is not available.")
            return result
        release = self.document(f"/v1/catalog/releases/{release_id}")
        if (
            as_uuid(release.get("id")) != release_id
            or normalized(release.get("name")) != normalized(card.get("releaseName"))
            or str(release.get("year")) != str(card.get("releaseYear"))
        ):
            result.update(eligible=False, reason="Catalog release details disagree.")
            return result
        for field, parent, route, key in [
            (definition.sport, "segmentId", "segments", "segments"),
            (definition.manufacturer, "manufacturerId", "manufacturers", "manufacturers"),
        ]:
            if not field:
                continue
            rows = self.objects(
                self.document(f"/v1/catalog/{route}", {"name": field, "take": 20, "skip": 0}).get(
                    key
                )
            )
            if not any(
                normalized(row.get("name")) == normalized(field)
                and as_uuid(row.get("id")) == as_uuid(release.get(parent))
                and as_uuid(row.get("id")) is not None
                for row in rows
            ):
                result.update(
                    eligible=False, reason="Sport or manufacturer does not match this release."
                )
                return result
        return result

    def grade_options(self, copy):
        if copy.condition == "raw":
            return []
        companies = self.objects(self.document("/v1/grades/companies").get("companies"))
        options = []
        for company in companies:
            company_id = as_uuid(company.get("id"))
            if not company_id or normalized(company.get("name")) != normalized(copy.grader):
                continue
            types = self.document(f"/v1/grades/companies/{company_id}/types").get("types", [])
            if not isinstance(types, list) or len(types) > 10:
                raise HTTPException(502, "CardSight grading categories could not be validated.")
            for kind in self.objects(types, maximum=10):
                if (
                    kind.get("gradingCompanyId") is not None
                    and as_uuid(kind["gradingCompanyId"]) != company_id
                ):
                    raise HTTPException(502, "CardSight returned a conflicting grading company.")
                kind_id = as_uuid(kind.get("id"))
                if not kind_id:
                    continue
                grades = self.document(
                    f"/v1/grades/companies/{company_id}/types/{kind_id}/grades"
                ).get("grades", [])
                for grade in self.objects(grades):
                    if (
                        grade.get("gradingCompanyId") is not None
                        and as_uuid(grade["gradingCompanyId"]) != company_id
                    ) or (
                        grade.get("gradingTypeId") is not None
                        and as_uuid(grade["gradingTypeId"]) != kind_id
                    ):
                        raise HTTPException(
                            502, "CardSight returned a conflicting grading category."
                        )
                    grade_id = as_uuid(grade.get("id"))
                    if grade_id and normalized_grade(
                        str(grade.get("grade", ""))
                    ) == normalized_grade(copy.grade):
                        options.append(
                            {
                                "id": str(grade_id),
                                "label": (
                                    f"{company['name']} · {kind.get('name', 'Grade')}"
                                    f" · {grade['grade']}"
                                ),
                            }
                        )
        return options

    def candidates(self, db, copy):
        definition = db.get(CardDefinition, copy.definition_id)
        params = {"name": definition.subject, "take": 20, "skip": 0}
        if definition.year:
            # Seasons such as 1986-87 are not equal to the catalog's exact "1986" filter.
            params["min_year"] = str(definition.year)
            params["max_year"] = str(definition.year + 1)
        if definition.card_number:
            params["number"] = definition.card_number
        result = self.document("/v1/catalog/cards", params)
        cards = result.get("cards")
        if not isinstance(cards, list):
            raise HTTPException(502, "CardSight returned an invalid card catalog response.")
        proposed = []
        for card in cards[:20]:
            if not isinstance(card, dict):
                continue
            if definition.parallel and not card.get("parallels") and as_uuid(card.get("id")):
                if len(proposed) >= 5:
                    continue
                card = self.document(f"/v1/catalog/cards/{as_uuid(card['id'])}")
            proposed.append(self.verified_candidate(definition, card))
        return {
            "definition_id": copy.definition_id,
            "candidates": proposed,
            "grade_options": self.grade_options(copy),
            "note": "Confirm the exact issue and grading label. No sales are manually imported.",
        }

    @staticmethod
    def price_key(link):
        return (link.provider_card_id, link.provider_parallel_id, link.provider_grade_id)

    def parse_prices(self, payload, link, copy, limit):
        if (
            not isinstance(payload, dict)
            or not isinstance(payload.get("card"), dict)
            or as_uuid(payload["card"].get("card_id")) != link.provider_card_id
        ):
            raise HTTPException(502, "CardSight returned a different card identity.")
        query = payload.get("query", {})
        if not isinstance(query, dict) or query.get("listing_type") != "auction":
            raise HTTPException(502, "CardSight did not return completed-auction evidence.")
        for field in ("parallel_id", "grade_id"):
            if field not in query or (query[field] is not None and as_uuid(query[field]) is None):
                raise HTTPException(502, "CardSight returned an invalid identity filter.")
        if as_uuid(query["parallel_id"]) != link.provider_parallel_id:
            raise HTTPException(502, "CardSight returned a different parallel filter.")
        if as_uuid(query["grade_id"]) != link.provider_grade_id:
            raise HTTPException(502, "CardSight returned a different grading filter.")
        rows = []
        if link.provider_grade_id is None:
            raw = payload.get("raw", {})
            if not isinstance(raw, dict) or not isinstance(raw.get("records", []), list):
                raise HTTPException(502, "CardSight returned invalid raw-price evidence.")
            rows = [(row, None) for row in raw.get("records", [])]
        else:
            companies = payload.get("graded", [])
            if not isinstance(companies, list):
                raise HTTPException(502, "CardSight returned invalid grading evidence.")
            for company in companies:
                if not isinstance(company, dict) or not isinstance(company.get("grades", []), list):
                    raise HTTPException(502, "CardSight returned invalid grading evidence.")
                if normalized(company.get("company_name")) != normalized(copy.grader):
                    continue
                for grade in company.get("grades", []):
                    if not isinstance(grade, dict) or not isinstance(
                        grade.get("records", []), list
                    ):
                        raise HTTPException(502, "CardSight returned invalid grade-price evidence.")
                    if as_uuid(
                        grade.get("grade_id")
                    ) == link.provider_grade_id and normalized_grade(
                        str(grade.get("grade_value", ""))
                    ) == normalized_grade(copy.grade):
                        context = {
                            "company_name": company["company_name"],
                            "grade_value": str(grade["grade_value"]),
                        }
                        rows.extend((row, context) for row in grade.get("records", []))
        sales, seen = [], set()
        for row, grade in rows[:limit]:
            if (
                not isinstance(row, dict)
                or as_uuid(row.get("parallel_id")) != link.provider_parallel_id
            ):
                continue
            if link.provider_parallel_id is None and row.get("parallel_name"):
                continue
            # An invalid non-null UUID is not evidence for the base card.
            if row.get("parallel_id") is not None and as_uuid(row["parallel_id"]) is None:
                continue
            sale = parse_sale({**row, "grade": grade}, now_utc().date())
            if sale is None or sale.id in seen or sale.condition != copy.condition:
                continue
            seen.add(sale.id)
            sales.append(sale)
        metadata = payload.get("meta") or {}
        count = (
            metadata.get("total_records", len(rows)) if isinstance(metadata, dict) else len(rows)
        )
        truncated = (
            bool(payload.get("messages"))
            or (isinstance(count, (int, float)) and count >= limit)
            or len(rows) >= limit
        )
        return {
            "sales": sales,
            "fetched_at": now_utc(),
            "expires_at": now_utc() + MAX_CACHE_AGE,
            "note": "Provider-reported auctions; not independently verified. "
            + ("The provider row limit may omit older sales. " if truncated else "")
            + "Raw condition is unassessed; prices exclude shipping, tax and fees.",
        }

    def refresh(self, copies, links, force=False):
        with self.lock:
            self.purge()
            groups = defaultdict(dict)
            now = now_utc()
            for copy in copies:
                link = links.get(copy.id)
                if not link or link.copy_signature != signature(copy) or copy.currency != "USD":
                    continue
                if copy.condition == "raw" and copy.raw_condition != "unspecified":
                    continue
                key = self.price_key(link)
                cached = self.prices.get(key)
                if cached and (not force or now - cached["fetched_at"] < timedelta(minutes=5)):
                    continue
                if key in self.errors or (self.retry_after and self.retry_after > now):
                    continue
                groups[(link.provider_parallel_id, link.provider_grade_id)][
                    link.provider_card_id
                ] = (copy, link)
            for (parallel_id, grade_id), group in list(groups.items())[:MAX_REFRESH_GROUPS]:
                entries = list(group.values())[:100]
                try:
                    params = {
                        "parallel_id": str(parallel_id) if parallel_id else "null",
                        "grade_id": str(grade_id) if grade_id else "null",
                        "listing_type": "auction",
                        "period": "all",
                        "limit": 500,
                    }
                    if len(entries) == 1:
                        copy, link = entries[0]
                        payloads = {
                            link.provider_card_id: fetch_json(
                                self.key(), f"/v1/pricing/{link.provider_card_id}", params
                            )
                        }
                        limit = 500
                    else:
                        body = {
                            **params,
                            "parallel_id": str(parallel_id) if parallel_id else None,
                            "grade_id": str(grade_id) if grade_id else None,
                            "limit": 50,
                            "card_ids": [str(link.provider_card_id) for _, link in entries],
                        }
                        result = fetch_json(self.key(), "/v1/pricing/", body=body)
                        if not isinstance(result.get("results"), list):
                            raise HTTPException(502, "CardSight returned invalid batch prices.")
                        payloads = {
                            as_uuid(row.get("card_id")): row.get("data")
                            for row in result["results"]
                            if isinstance(row, dict) and row.get("success") is True
                        }
                        limit = 50
                    for copy, link in entries:
                        key = self.price_key(link)
                        try:
                            cached = self.parse_prices(
                                payloads.get(link.provider_card_id), link, copy, limit
                            )
                            self.prices[key] = cached
                            self.errors.pop(key, None)
                        except HTTPException as error:
                            self.prices.pop(key, None)
                            self.errors[key] = (now_utc() + RETRY_DELAY, error.detail)
                except HTTPException as error:
                    for _, link in entries:
                        key = self.price_key(link)
                        self.prices.pop(key, None)
                        self.errors[key] = (now_utc() + RETRY_DELAY, error.detail)
                    self.retry_after = now_utc() + RETRY_DELAY
                    break
            while len(self.prices) > MAX_CACHE_ENTRIES:
                self.prices.popitem(last=False)
            while len(self.errors) > MAX_CACHE_ENTRIES:
                self.errors.pop(next(iter(self.errors)))

    def report(self, copy, link):
        now = now_utc()
        key = self.price_key(link)
        self.purge()
        cached = self.prices.get(key)
        status, reason = "pending", "Waiting for an automatic price refresh."
        if link.copy_signature != signature(copy):
            cached, status, reason = (
                None,
                "mismatch",
                "Card identity or grading changed. Confirm its exact match again.",
            )
        elif copy.currency != "USD":
            cached, status, reason = (
                None,
                "insufficient",
                "CardSight prices are USD. No currency conversion is applied.",
            )
        elif copy.condition == "raw" and copy.raw_condition != "unspecified":
            cached, status, reason = (
                None,
                "insufficient",
                "CardSight raw condition is unassessed; condition-specific pricing is unavailable.",
            )
        elif not self.settings.cardsight_api_key:
            cached, status, reason = (
                None,
                "unavailable",
                "Connect CardSight to refresh this estimate.",
            )
        elif key in self.errors or (self.retry_after and self.retry_after > now and cached is None):
            cached, status, reason = (
                None,
                "unavailable",
                self.errors.get(key, (None, "CardSight will retry shortly."))[1],
            )
        items = []
        if cached:
            items = [
                ComparableOutput(
                    id=uuid5(NAMESPACE_URL, "cardsight:" + sale.id),
                    definition_id=copy.definition_id,
                    sold_on=sale.sold_on,
                    price=sale.price,
                    currency="USD",
                    condition=sale.condition,
                    grader=sale.grader,
                    grade=sale.grade,
                    raw_condition="unspecified",
                    source="CardSight · " + sale.source[:108],
                    source_url=sale.source_url,
                    image_url=sale.image_url,
                    created_at=cached["fetched_at"],
                )
                for sale in cached["sales"]
            ]
        estimate = estimate_for(copy, items, now.date())
        if cached:
            status = "live" if estimate.amount is not None else "insufficient"
            reason = (
                "Median of CardSight-reported completed auctions. "
                if estimate.amount is not None
                else "At least three exact matching auctions within 180 days are needed. "
            )
            reason += (
                "Raw condition is unassessed. "
                if copy.condition == "raw"
                else "Same grading company, label and grade. "
            )
            reason += "Sources and accepted prices are not independently verified."
        estimate = estimate.model_copy(
            update={
                "source": "cardsight",
                "pricing_status": status,
                "reason": reason,
                "fetched_at": cached["fetched_at"] if cached else None,
                "refresh_after": cached["expires_at"] if cached else None,
                "pricing_note": cached["note"] if cached else reason,
            }
        )
        return {
            "items": items,
            "matching_sale_ids": [sale.id for sale in matching_sales(copy, items, now.date())],
            "estimate": estimate,
        }

    @staticmethod
    def current_links(db, copies):
        return {
            link.copy_id: link
            for link in db.scalars(
                select(MarketLink)
                .where(MarketLink.copy_id.in_([copy.id for copy in copies]))
                .execution_options(populate_existing=True)
            )
        }

    def estimates(self, db, copies):
        links = self.current_links(db, copies)
        self.refresh(copies, links)
        # Network latency must not make a concurrent edit/rematch use superseded prices.
        current = list(
            db.scalars(
                select(OwnedCopy)
                .where(OwnedCopy.id.in_([copy.id for copy in copies]))
                .execution_options(populate_existing=True)
            )
        )
        links = self.current_links(db, current)
        with self.lock:
            return {
                copy.id: self.report(copy, links[copy.id])["estimate"]
                for copy in current
                if copy.id in links
            }

    def comparables(self, db, copy, force=False):
        link = self.current_links(db, [copy]).get(copy.id)
        if link is None:
            return None
        self.refresh([copy], {copy.id: link}, force=force)
        current = db.scalar(
            select(OwnedCopy)
            .where(OwnedCopy.id == copy.id)
            .execution_options(populate_existing=True)
        )
        if current is None:
            raise HTTPException(404, "Card not found.")
        link = self.current_links(db, [current]).get(copy.id)
        if link is None:
            return None
        with self.lock:
            return self.report(current, link)
