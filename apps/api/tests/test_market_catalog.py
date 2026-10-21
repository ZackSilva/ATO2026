"""Catalog search contracts use synthetic provider responses, never a live account."""

from copy import deepcopy
from types import SimpleNamespace
from urllib.error import HTTPError
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from slabtrak import market_values
from slabtrak.models import CardDefinition, ComparableSale, MarketLink, OwnedCopy
from tests.test_inventory import access

CARD_ID = str(uuid4())
KEY = "isolated-catalog-test-key"
FETCH_JSON = market_values.fetch_json


def search_card(**changes):
    # SearchResult in the official /documentation/json specification.
    return {
        "type": "card",
        "id": CARD_ID,
        "name": "Shohei Ohtani",
        "relevance": 9.8,
        "year": "2023",
        "setName": "Base Set",
        "releaseName": "2023 Topps Chrome Baseball",
        "manufacturerName": "Topps",
        "segmentName": "Baseball",
        "cardNumber": "17",
        **changes,
    }


@pytest.fixture(autouse=True)
def catalog_provider(monkeypatch):
    monkeypatch.setenv("CARDSIGHT_API_KEY", KEY)
    state = {
        "calls": [],
        "search": {"results": [search_card()], "total_count": 1, "skip": 0, "take": 20},
        "detail": {
            "id": CARD_ID,
            "name": "Shohei Ohtani",
            "number": "17",
            "releaseId": str(uuid4()),
            "setId": str(uuid4()),
            "releaseYear": "2023",
            "releaseName": "2023 Topps Chrome Baseball",
            "setName": "Base Set",
            "parallelCount": 0,
            "parallels": [],
            "isParallelOnly": False,
        },
    }

    def fetch(key, path, params=None, body=None):
        assert key == KEY
        assert body is None
        state["calls"].append((path, deepcopy(params)))
        if path == "/v1/catalog/search":
            return deepcopy(state["search"])
        assert path == f"/v1/catalog/cards/{CARD_ID}"
        return deepcopy(state["detail"])

    monkeypatch.setattr(market_values, "fetch_json", fetch)
    return state


def search(client, query="2023 Topps Chrome Shohei Ohtani"):
    return client.post("/api/market/catalog/search", json={"query": query})


def test_query_search_uses_documented_free_text_contract_and_shared_cache(client, catalog_provider):
    access(client)
    response = search(client)
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item == {
        "id": CARD_ID,
        "subject": "Shohei Ohtani",
        "year": 2023,
        "sport": "Baseball",
        "manufacturer": "Topps",
        "set_name": "Topps Chrome",
        "card_number": "17",
        "parallel": "",
        "description": "",
    }
    assert response.json()["truncated"] is False
    assert "blank parallel does not confirm a base card" in response.json()["note"]
    assert search(client).status_code == 200
    assert catalog_provider["calls"] == [
        (
            "/v1/catalog/search",
            {"q": "2023 Topps Chrome Shohei Ohtani", "type": "card", "take": 20, "skip": 0},
        )
    ]


def test_search_and_selected_detail_never_write_collection_or_links(client, app, catalog_provider):
    access(client)
    models = (CardDefinition, OwnedCopy, ComparableSale, MarketLink)
    with app.state.sessions() as db:
        before = [db.scalar(select(func.count()).select_from(model)) for model in models]
    assert search(client).status_code == 200
    response = client.post("/api/market/catalog/card", json={"card_id": CARD_ID})
    assert response.status_code == 200
    item = response.json()["item"]
    assert item["id"] == CARD_ID
    assert item["subject"] == "Shohei Ohtani"
    assert item["year"] == 2023
    assert item["card_number"] == "17"
    assert item["sport"] == item["manufacturer"] == item["parallel"] == ""
    assert "owner_id" not in item and "price" not in item
    with app.state.sessions() as db:
        after = [db.scalar(select(func.count()).select_from(model)) for model in models]
    assert after == before
    assert catalog_provider["calls"][-1] == (f"/v1/catalog/cards/{CARD_ID}", None)


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/market/catalog/search", {"query": "Ohtani"}),
        ("/api/market/catalog/card", {"card_id": CARD_ID}),
    ],
)
def test_catalog_requires_login_and_csrf(client, catalog_provider, path, body):
    assert client.post(path, json=body).status_code == 401
    access(client)
    del client.headers["X-CSRF-Token"]
    assert client.post(path, json=body).status_code == 403
    assert catalog_provider["calls"] == []


@pytest.mark.parametrize("query", ["abc", " ", "x" * 201, "Ohtani\x00", "Ohtani\nChrome"])
def test_query_validation_does_not_call_provider(client, catalog_provider, query):
    access(client)
    assert search(client, query).status_code == 422
    assert catalog_provider["calls"] == []


def test_selected_id_is_validated_and_provider_identity_must_agree(client, catalog_provider):
    access(client)
    assert (
        client.post("/api/market/catalog/card", json={"card_id": "../pricing"}).status_code == 422
    )
    assert catalog_provider["calls"] == []
    catalog_provider["detail"]["id"] = str(uuid4())
    response = client.post("/api/market/catalog/card", json={"card_id": CARD_ID})
    assert response.status_code == 502
    assert "confirm the selected" in response.json()["detail"]


def test_search_filters_malformed_noncard_and_duplicate_results(client, catalog_provider):
    access(client)
    catalog_provider["search"]["results"] = [
        None,
        search_card(type="release"),
        search_card(id="not-a-uuid"),
        search_card(name=""),
        search_card(name="x" * 201),
        search_card(name="bad\x00name"),
        search_card(),
        search_card(),
    ]
    response = search(client)
    assert response.status_code == 200
    assert len(response.json()["items"]) == 1
    assert "omitted" in response.json()["note"]


def test_search_bounds_results_and_preserves_parallel_hint_without_making_a_link(
    client, catalog_provider
):
    access(client)
    catalog_provider["search"]["results"] = [
        search_card(id=str(uuid4()), parallelName="Gold Refractor", numberedTo=50)
        for _ in range(30)
    ]
    catalog_provider["search"]["total_count"] = 500
    payload = search(client).json()
    assert len(payload["items"]) == 20
    assert payload["truncated"] is True
    assert {item["parallel"] for item in payload["items"]} == {"Gold Refractor"}
    assert "suggestions" in payload["note"]
    assert len(catalog_provider["calls"]) == 1  # No per-result detail requests.


@pytest.mark.parametrize("year", ["1799", "2201", "bad", None, {}, 2023])
def test_search_does_not_invent_a_year(client, catalog_provider, year):
    access(client)
    catalog_provider["search"]["results"] = [search_card(year=year)]
    response = search(client)
    assert response.status_code == 200
    assert response.json()["items"][0]["year"] is None


def test_subset_and_missing_fields_remain_reviewable(client, catalog_provider):
    access(client)
    catalog_provider["search"]["results"] = [
        search_card(setName="Rookie Autographs", cardNumber=None, manufacturerName={})
    ]
    item = search(client).json()["items"][0]
    assert item["set_name"] == "Topps Chrome Rookie Autographs"
    assert item["manufacturer"] == item["card_number"] == ""
    catalog_provider["detail"].update(
        isParallelOnly=True,
        parallelCount=1,
        parallels=[{"id": str(uuid4()), "name": "Gold Refractor"}],
        variationOf=str(uuid4()),
    )
    payload = client.post("/api/market/catalog/card", json={"card_id": CARD_ID}).json()
    assert payload["item"]["parallel"] == ""
    assert "choose the parallel" in payload["note"]
    assert "variation" in payload["note"]


def test_malformed_results_are_provider_error(client, catalog_provider):
    access(client)
    catalog_provider["search"]["results"] = {}
    assert search(client).status_code == 502


def test_missing_connection_returns_actionable_error(client, app, catalog_provider):
    access(client)
    app.state.market_values.settings.cardsight_api_key = None
    response = search(client)
    assert response.status_code == 503
    assert "Connect CardSight" in response.json()["detail"]
    assert catalog_provider["calls"] == []


@pytest.mark.parametrize("code, expected", [(401, 502), (403, 502), (429, 429), (500, 502)])
def test_provider_failures_use_sanitized_shared_transport(
    client, catalog_provider, monkeypatch, code, expected
):
    access(client)

    def fail(*args, **kwargs):
        raise HTTPError("https://provider.invalid/" + KEY, code, "private diagnostic", {}, None)

    monkeypatch.setattr(market_values, "fetch_json", FETCH_JSON)
    monkeypatch.setattr(market_values, "build_opener", lambda *args: SimpleNamespace(open=fail))
    response = search(client)
    assert response.status_code == expected
    assert KEY not in response.text
    assert "private diagnostic" not in response.text


@pytest.mark.parametrize("season", ["2023-24", "2023/2024"])
def test_catalog_seasons_use_starting_year_without_duplicate_release_prefix(
    client, catalog_provider, season
):
    access(client)
    catalog_provider["search"]["results"] = [
        search_card(
            year=season,
            releaseName=f"{season} Panini Prizm Basketball",
            setName="Base Set",
            segmentName="Basketball",
            manufacturerName="Panini",
        )
    ]
    response = client.post("/api/market/catalog/search", json={"query": "season sample"})
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["year"] == 2023
    assert item["set_name"] == "Panini Prizm"
