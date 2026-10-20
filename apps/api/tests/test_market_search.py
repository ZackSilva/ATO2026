"""Mocked provider contracts; these tests do not claim live CardSight availability."""

import io
import json
from datetime import UTC, datetime
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from slabtrak import market_search
from slabtrak.config import Settings
from slabtrak.market_search import (
    MAX_RESPONSE_BYTES,
    MarketSearchInput,
    NoRedirects,
    fetch_payload,
    search_sales,
)
from slabtrak.models import ComparableSale, OwnedCopy
from tests.test_inventory import access

NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)
TEST_KEY = "test-provider-key-never-returned"


def auction(**changes):
    return {
        "title": "1986 Fleer Michael Jordan #57",
        "price": "123.45",
        "date": "2026-10-19T12:00:00Z",
        "source": "ebay",
        "listing_type": "auction",
        "url": "https://www.ebay.com/itm/123#details",
        **changes,
    }


def payload(*records):
    return {"query": {"listing_type": "auction"}, "results": list(records), "meta": {}}


@pytest.fixture(autouse=True)
def configured_key(monkeypatch):
    monkeypatch.setenv("CARDSIGHT_API_KEY", TEST_KEY)


def test_authenticated_csrf_search_is_transient_and_key_is_not_exposed(client, app, monkeypatch):
    calls = []

    def provider(key, search):
        calls.append((key, search.query))
        return payload(auction())

    monkeypatch.setattr(market_search, "fetch_payload", provider)
    assert client.get("/api/market/status").status_code == 401
    assert client.post("/api/market/search", json={"query": "Jordan"}).status_code == 401
    access(client)
    status = client.get("/api/market/status")
    assert status.json() == {"provider": "cardsight", "configured": True}
    token = client.headers.pop("x-csrf-token")
    assert client.post("/api/market/search", json={"query": "Jordan"}).status_code == 403
    client.headers["x-csrf-token"] = token
    assert (
        client.post(
            "/api/market/search", json={"query": "Jordan"}, headers={"Origin": "https://evil.test"}
        ).status_code
        == 403
    )
    response = client.post("/api/market/search", json={"query": "  Jordan  "})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    assert calls == [(TEST_KEY, "Jordan")]
    assert TEST_KEY not in response.text + status.text
    result = response.json()
    assert result["items"][0]["price"] == "123.45"
    assert result["items"][0]["source_url"] == "https://www.ebay.com/itm/123"
    assert result["items"][0]["image_url"] is None
    assert result["items"][0]["condition"] == "raw"
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(ComparableSale)) == 0
        assert db.scalar(select(func.count()).select_from(OwnedCopy)) == 0


def test_missing_key_has_clear_status_without_contacting_provider(client, monkeypatch):
    # A separately built Settings object ensures missing/blank key cannot reveal any local key.
    settings = Settings(database_url="postgresql+psycopg://unused", cardsight_api_key=" ")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    app.include_router(market_search.market_search_router(settings, lambda: (), lambda: ()))
    monkeypatch.setattr(
        market_search, "fetch_payload", lambda *_: pytest.fail("Provider must not be called")
    )
    with TestClient(app) as isolated:
        assert isolated.get("/api/market/status").json()["configured"] is False
        response = isolated.post("/api/market/search", json={"query": "Jordan"})
    assert response.status_code == 503
    assert "CARDSIGHT_API_KEY" in response.json()["detail"]


@pytest.mark.parametrize(
    "body",
    [
        {"query": "a"},
        {"query": " " * 10},
        {"query": "x" * 201},
        {"query": "Jordan\nPSA"},
        {"query": "Jordan", "period": "20y"},
        {"query": "Jordan", "listing_type": "fixed"},
        {"query": "Jordan", "condition": "raw", "grade": "9"},
        {"query": "Jordan", "api_key": TEST_KEY},
    ],
)
def test_invalid_search_never_contacts_provider(client, monkeypatch, body):
    access(client)
    monkeypatch.setattr(
        market_search, "fetch_payload", lambda *_: pytest.fail("Provider must not be called")
    )
    response = client.post("/api/market/search", json=body)
    assert response.status_code == 422
    assert TEST_KEY not in response.text


@pytest.mark.parametrize(
    "changes",
    [
        {"listing_type": "fixed"},
        {"listing_type": "both"},
        {"listing_type": None},
        {"price": "NaN"},
        {"price": "Infinity"},
        {"price": "0"},
        {"price": "-1"},
        {"price": "1.001"},
        {"price": "10000000000"},
        {"date": "2026-10-21"},
        {"date": "2026-10-19garbage"},
        {"date": None},
        {"currency": "CAD"},
    ],
)
def test_rejects_asking_prices_invalid_money_dates_and_currency(changes):
    result = search_sales(payload(auction(**changes)), MarketSearchInput(query="Jordan"), NOW)
    assert result.items == []
    assert result.discarded_count == 1


def test_grade_filter_never_converts_missing_context_into_a_graded_or_raw_match():
    graded = auction(
        grade={"company_name": "psa", "grade_value": "9.0"},
        title="Jordan PSA 9",
        url="https://example.com/graded",
    )
    missing_context = auction(title="Jordan PSA 10", url="https://example.com/unknown")
    raw = auction(title="Jordan ungraded", url="https://example.com/raw")
    records = payload(graded, missing_context, raw)
    all_sales = search_sales(records, MarketSearchInput(query="Jordan"), NOW)
    assert [item.condition for item in all_sales.items] == ["graded", "unknown", "raw"]
    matching = search_sales(
        records,
        MarketSearchInput(query="Jordan", condition="graded", grader="PSA", grade="9"),
        NOW,
    )
    assert len(matching.items) == 1
    assert matching.items[0].price == Decimal("123.45")
    raw_only = search_sales(records, MarketSearchInput(query="Jordan", condition="raw"), NOW)
    assert len(raw_only.items) == 1 and raw_only.items[0].condition == "raw"


@pytest.mark.parametrize("context", [{}, {"company_name": "PSA"}, "PSA 9"])
def test_incomplete_or_malformed_grade_context_remains_unknown(context):
    result = search_sales(payload(auction(grade=context)), MarketSearchInput(query="Jordan"), NOW)
    assert result.items[0].condition == "unknown"


def test_filters_old_dates_deduplicates_and_bounds_returned_records():
    duplicate = auction()
    old = auction(date="2024-10-19", url="https://example.com/old")
    result = search_sales(
        payload(duplicate, duplicate, old), MarketSearchInput(query="Jordan", period="1w"), NOW
    )
    assert len(result.items) == 1 and result.discarded_count == 2
    large = search_sales(
        payload(*(auction(url=f"https://example.com/{i}") for i in range(101))),
        MarketSearchInput(query="Jordan"),
        NOW,
    )
    assert len(large.items) == 100 and large.truncated


@pytest.mark.parametrize(
    "url", ["javascript:alert(1)", "https://user:secret@example.com/x", "http://[", "https://a b/x"]
)
def test_unsafe_provider_links_are_never_exposed(url):
    result = search_sales(payload(auction(url=url)), MarketSearchInput(query="Jordan"), NOW)
    assert result.items[0].source_url == ""


def test_listing_image_preview_is_preserved_without_fetching_it(monkeypatch):
    monkeypatch.setattr(
        market_search, "build_opener", lambda *_: pytest.fail("Images must not be fetched")
    )
    image = "https://i.ebayimg.com/images/g/example/s-l1600.jpg"
    result = search_sales(
        payload(auction(image_url=f"{image}#preview")), MarketSearchInput(query="Jordan"), NOW
    )
    assert len(result.items) == 1
    assert result.items[0].image_url == image


@pytest.mark.parametrize(
    "image",
    [
        None,
        "",
        123,
        "not a URL",
        "http://i.ebayimg.com/image.jpg",
        "javascript:alert(1)",
        "data:image/png;base64,abc",
        "https://user:secret@i.ebayimg.com/image.jpg",
        "https://i.ebayimg.com/image name.jpg",
        "https://i.ebayimg.com/image\nname.jpg",
        "https://i.ebayimg.com/image\x7fname.jpg",
        "https://localhost/image.jpg",
        "https://preview.localhost/image.jpg",
        "https://localhost./image.jpg",
        "https://intranet/image.jpg",
        "https://preview.local/image.jpg",
        "https://preview.internal/image.jpg",
        "https://127.0.0.1/image.jpg",
        "https://127.1/image.jpg",
        "https://0177.0.0.1/image.jpg",
        "https://0x7f.0.0.1/image.jpg",
        "https://10.0.0.1/image.jpg",
        "https://169.254.169.254/image.jpg",
        "https://192.168.1.1/image.jpg",
        "https://[::1]/image.jpg",
        "https://[fc00::1]/image.jpg",
        "https://[ff02::1]/image.jpg",
        "https://i.ebayimg.com:invalid/image.jpg",
        "https://i.ebayimg.com:99999/image.jpg",
        "https://[",
    ],
)
def test_missing_or_unsafe_images_do_not_discard_valid_sales(image):
    result = search_sales(payload(auction(image_url=image)), MarketSearchInput(query="Jordan"), NOW)
    assert len(result.items) == 1
    assert result.discarded_count == 0
    assert result.items[0].image_url is None


def test_outbound_request_forces_auction_limits_and_prohibits_redirects(monkeypatch):
    calls = []

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            return io.BytesIO(json.dumps(payload(auction())).encode())

    def opener(handler):
        assert isinstance(handler, NoRedirects)
        assert handler.redirect_request(None, None, 302, "", {}, "https://evil.test") is None
        return Opener()

    monkeypatch.setattr(market_search, "build_opener", opener)
    fetch_payload(TEST_KEY, MarketSearchInput(query="Jordan & PSA", period="1w"))
    request, timeout = calls[0]
    assert timeout == 10
    assert request.get_header("X-api-key") == TEST_KEY
    parsed = urlsplit(request.full_url)
    assert parsed.scheme == "https" and parsed.netloc == "api.cardsight.ai"
    assert parse_qs(parsed.query) == {
        "q": ["Jordan & PSA"],
        "period": ["7d"],
        "listing_type": ["auction"],
        "limit": ["100"],
    }


@pytest.mark.parametrize(
    "code,status", [(401, 502), (403, 502), (429, 429), (500, 502), (302, 502)]
)
def test_upstream_errors_never_expose_provider_body_or_key(monkeypatch, code, status):
    class Opener:
        def open(self, request, timeout):
            raise HTTPError(request.full_url, code, TEST_KEY, {}, io.BytesIO(TEST_KEY.encode()))

    monkeypatch.setattr(market_search, "build_opener", lambda *_: Opener())
    with pytest.raises(HTTPException) as error:
        fetch_payload(TEST_KEY, MarketSearchInput(query="Jordan"))
    assert error.value.status_code == status
    assert TEST_KEY not in error.value.detail


@pytest.mark.parametrize("failure", [URLError(TEST_KEY), TimeoutError(TEST_KEY), OSError(TEST_KEY)])
def test_transport_failures_are_safe(monkeypatch, failure):
    class Opener:
        def open(self, request, timeout):
            raise failure

    monkeypatch.setattr(market_search, "build_opener", lambda *_: Opener())
    with pytest.raises(HTTPException) as error:
        fetch_payload(TEST_KEY, MarketSearchInput(query="Jordan"))
    assert error.value.status_code == 503 and TEST_KEY not in error.value.detail


@pytest.mark.parametrize(
    "body", [b"not json", b"[]", b'{"results":{}}', b"x" * (MAX_RESPONSE_BYTES + 1)]
)
def test_malformed_or_oversized_responses_fail_safely(monkeypatch, body):
    class Opener:
        def open(self, request, timeout):
            return io.BytesIO(body)

    monkeypatch.setattr(market_search, "build_opener", lambda *_: Opener())
    with pytest.raises(HTTPException) as error:
        fetch_payload(TEST_KEY, MarketSearchInput(query="Jordan"))
    assert error.value.status_code == 502
