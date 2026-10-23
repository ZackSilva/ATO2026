"""Saved research stays owner-scoped and cannot silently change valuation evidence."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from slabtrak.models import Account, ComparableSale, MarketLink
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_inventory import access, add, edit


def test_remembering_and_clearing_query_preserves_card_and_evidence(client, app):
    access(client)
    card = add(client, purchase_price="42.25", notes="Keep these notes")
    route = f"/api/cards/{card['id']}/market-query"
    saved = client.put(route, json={"revision": card["revision"], "market_query": "  1986 Fleer  "})
    assert saved.status_code == 200, saved.text
    current = saved.json()
    assert current["market_query"] == "1986 Fleer"
    assert current["revision"] == card["revision"] + 1
    for field in ("subject", "definition_id", "purchase_price", "notes", "condition"):
        assert current[field] == card[field]
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(ComparableSale)) == 0
        assert db.scalar(select(func.count()).select_from(MarketLink)) == 0
    cleared = client.put(route, json={"revision": current["revision"], "market_query": ""})
    assert cleared.status_code == 200
    assert cleared.json()["market_query"] == ""


def test_saved_query_survives_older_editor_and_stale_requests_fail(client):
    access(client)
    card = add(client, market_query="1986 Fleer")
    payload = edit(card, notes="An ordinary metadata edit")
    payload.pop("market_query")
    updated = client.put(f"/api/cards/{card['id']}", json=payload)
    assert updated.status_code == 200
    assert updated.json()["market_query"] == "1986 Fleer"
    stale = client.put(
        f"/api/cards/{card['id']}/market-query",
        json={"revision": card["revision"], "market_query": "Another query"},
    )
    assert stale.status_code == 409
    assert client.get(f"/api/cards/{card['id']}").json()["market_query"] == "1986 Fleer"


@pytest.mark.parametrize("query", ["abc", "x" * 201, "card\nquery", "card\x7fquery"])
def test_invalid_queries_are_rejected_on_both_write_paths(client, query):
    access(client)
    assert (
        client.post("/api/cards", json={"subject": "Test", "market_query": query}).status_code
        == 422
    )
    card = add(client)
    response = client.put(
        f"/api/cards/{card['id']}/market-query",
        json={"revision": card["revision"], "market_query": query},
    )
    assert response.status_code == 422
    assert client.get(f"/api/cards/{card['id']}").json()["market_query"] == ""


def test_query_write_requires_auth_csrf_and_only_query_fields(client):
    access(client)
    card = add(client)
    route = f"/api/cards/{card['id']}/market-query"
    payload = {"revision": card["revision"], "market_query": "1986 Fleer"}
    assert client.put(route, json=payload | {"purchase_price": "0"}).status_code == 422
    assert client.put(route, json={"revision": card["revision"]}).status_code == 422
    client.headers.pop("x-csrf-token")
    assert client.put(route, json=payload).status_code == 403
    client.cookies.clear()
    assert client.put(route, json=payload).status_code == 401


def test_other_collector_cannot_save_query_on_someone_elses_card(client, app):
    access(client)
    card = add(client, market_query="Keep this query")
    with app.state.sessions() as db:
        db.add(
            Account(
                username="another-collector",
                password_hash=password_hasher.hash(PASSWORD),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
        access(other, "another-collector")
        result = other.put(
            f"/api/cards/{card['id']}/market-query",
            json={"revision": card["revision"], "market_query": "Changed query"},
        )
        assert result.status_code == 404
    assert client.get(f"/api/cards/{card['id']}").json()["market_query"] == "Keep this query"
