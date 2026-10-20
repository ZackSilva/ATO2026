"""Private completed sales support raw and graded estimates without synthetic prices."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from slabtrak.estimates import estimate_for
from slabtrak.models import Account, ComparableSale, OwnedCopy
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_inventory import access, add, edit


def completed(client, card, price="100", **fields):
    response = client.post(
        f"/api/cards/{card['id']}/comparables",
        json={
            "expected_definition_id": card["definition_id"],
            "sold_on": datetime.now(UTC).date().isoformat(),
            "price": price,
            "source": "Private completed sale",
            "source_url": f"https://example.com/sales/{uuid4()}",
            **fields,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def listed(client, card):
    response = client.get(f"/api/cards/{card['id']}/comparables")
    assert response.status_code == 200, response.text
    return response.json()


def test_raw_estimate_uses_exact_cents_and_preserves_unknown_before_minimum(client):
    access(client)
    card = add(client)
    assert listed(client, card)["estimate"]["amount"] is None
    for price in ("10.01", "20.02"):
        completed(client, card, price)
    short = listed(client, card)["estimate"]
    assert short["sample_count"] == 2 and short["amount"] is None
    completed(client, card, "15.03")
    estimated = listed(client, card)["estimate"]
    assert (estimated["amount"], estimated["low"], estimated["high"]) == ("15.03", "10.01", "20.02")
    assert estimated["confidence"] == "low"
    assert "condition is unverified" in estimated["reason"]
    completed(client, card, "15.04")
    assert listed(client, card)["estimate"]["amount"] == "15.04"
    assert client.get(f"/api/cards/{card['id']}").json() == card


def test_same_grader_grade_identity_currency_only_with_other_grades_visible(client):
    access(client)
    raw = add(client)
    graded = add(client, condition="graded", grader="PSA", grade="9.0")
    for price in ("90", "100", "110", "120", "130"):
        completed(client, graded, price, condition="graded", grader="psa", grade="9")
    completed(client, graded, "999", condition="graded", grader="PSA", grade="10")
    completed(client, graded, "888", condition="graded", grader="BGS", grade="9")
    completed(client, graded, "777", currency="CAD", condition="graded", grader="PSA", grade="9")
    completed(client, raw, "3")
    data = listed(client, graded)
    assert len(data["items"]) == 9
    assert data["estimate"]["sample_count"] == 5
    assert data["estimate"]["amount"] == "110.00"
    assert data["estimate"]["confidence"] == "medium"
    assert listed(client, raw)["estimate"]["sample_count"] == 1
    other = add(client, subject="Different card")
    assert listed(client, other)["items"] == []
    assert listed(client, other)["estimate"]["amount"] is None


def test_date_window_includes_today_and_179_days_but_not_older_or_future():
    today, definition = date(2026, 10, 20), uuid4()
    copy = OwnedCopy(
        id=uuid4(), definition_id=definition, currency="USD", condition="raw", grader="", grade=""
    )
    sales = [
        ComparableSale(
            definition_id=definition,
            currency="USD",
            condition="raw",
            grader="",
            grade="",
            sold_on=today + timedelta(days=offset),
            price=Decimal(price),
        )
        for offset, price in ((0, "10"), (-179, "20"), (-1, "15"), (-180, "1000"), (1, "900"))
    ]
    estimate = estimate_for(copy, sales, today)
    assert estimate.sample_count == 3
    assert estimate.amount == Decimal("15.00")
    assert estimate.latest_sale == today


@pytest.mark.parametrize(
    "fields",
    [
        {"price": "0"},
        {"price": "-1"},
        {"price": "1.001"},
        {"price": "10000000000"},
        {"currency": "usd"},
        {"currency": "US"},
        {"source": " "},
        {"sold_on": (datetime.now(UTC).date() + timedelta(days=1)).isoformat()},
        {"condition": "raw", "grade": "9"},
        {"condition": "graded", "grader": "PSA"},
        {"condition": "graded", "grade": "9"},
        {"source_url": "javascript:alert(1)"},
        {"source_url": "file:///etc/passwd"},
        {"source_url": "https://user:password@example.com/sale"},
        {"owner_id": str(uuid4())},
        {"definition_id": str(uuid4())},
        {"expected_definition_id": "not-a-uuid"},
        {"expected_definition_id": None},
    ],
)
def test_invalid_comparables_do_not_write(client, fields):
    access(client)
    card = add(client)
    response = client.post(
        f"/api/cards/{card['id']}/comparables",
        json={
            "expected_definition_id": card["definition_id"],
            "price": "10",
            "source": "Private sale",
            "sold_on": "2026-01-01",
            **fields,
        },
    )
    assert response.status_code == 422, response.text
    assert listed(client, card)["items"] == []


def test_duplicate_sources_and_duplicate_manual_sales_do_not_inflate_estimate(client):
    access(client)
    card = add(client)
    sale = completed(client, card, source_url="https://example.com/sales/one#description")
    assert sale["source_url"] == "https://example.com/sales/one"
    other = add(client, subject="Another identity")
    duplicate = {
        key: sale[key]
        for key in (
            "sold_on",
            "price",
            "currency",
            "condition",
            "grader",
            "grade",
            "source",
            "source_url",
        )
    }
    duplicate["expected_definition_id"] = other["definition_id"]
    assert client.post(f"/api/cards/{other['id']}/comparables", json=duplicate).status_code == 409
    completed(client, card, source_url="")
    duplicate["expected_definition_id"] = card["definition_id"]
    duplicate["source_url"] = ""
    assert client.post(f"/api/cards/{card['id']}/comparables", json=duplicate).status_code == 409
    assert len(listed(client, card)["items"]) == 2


def test_metadata_grade_currency_edits_recalculate_without_erasing_sales(client):
    access(client)
    card = add(client)
    sibling = add(client)
    for price in ("10", "20", "30"):
        completed(client, card, price)
    assert listed(client, sibling)["estimate"]["amount"] == "20.00"
    changed = client.put(f"/api/cards/{card['id']}", json=edit(card, currency="CAD")).json()
    assert len(listed(client, changed)["items"]) == 3
    assert listed(client, changed)["estimate"]["amount"] is None
    graded = client.put(
        f"/api/cards/{card['id']}",
        json=edit(changed, currency="USD", condition="graded", grader="PSA", grade="9"),
    ).json()
    assert listed(client, graded)["estimate"]["sample_count"] == 0
    identity = client.put(
        f"/api/cards/{card['id']}", json=edit(graded, subject="Corrected identity")
    ).json()
    assert listed(client, identity)["items"] == []
    assert len(listed(client, sibling)["items"]) == 3


def test_stale_identity_or_missing_identity_cannot_attach_evidence_to_another_card(client):
    access(client)
    card = add(client)
    sibling = add(client)
    changed = client.put(
        f"/api/cards/{card['id']}", json=edit(card, parallel="Different parallel")
    ).json()
    payload = {"sold_on": "2026-01-01", "price": "10", "source": "Private sale"}
    assert client.post(f"/api/cards/{card['id']}/comparables", json=payload).status_code == 422
    payload["expected_definition_id"] = card["definition_id"]
    response = client.post(f"/api/cards/{card['id']}/comparables", json=payload)
    assert response.status_code == 409
    assert "Reload the card" in response.json()["detail"]
    assert listed(client, changed)["items"] == []
    assert listed(client, sibling)["items"] == []
    completed(client, changed)
    assert len(listed(client, changed)["items"]) == 1
    assert listed(client, sibling)["items"] == []


def test_all_estimates_include_archived_unsold_and_are_not_limited_by_list_page(client):
    access(client)
    cards = [add(client, subject=f"Card {index}", archived=index % 2 == 0) for index in range(27)]
    add(client, sold=True, sale_price="10", sale_fees="0")
    response = client.get("/api/estimates?limit=1&status=active&q=missing")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert {item["card_id"] for item in response.json()["items"]} == {card["id"] for card in cards}
    assert all(item["amount"] is None for item in response.json()["items"])


def test_delete_comparable_recalculates_and_requires_matching_identity(client):
    access(client)
    card = add(client)
    other = add(client, subject="Different identity")
    sales = [completed(client, card, price) for price in ("10", "20", "30")]
    assert (
        client.delete(f"/api/cards/{other['id']}/comparables/{sales[0]['id']}").status_code == 404
    )
    assert client.delete(f"/api/cards/{card['id']}/comparables/{sales[0]['id']}").status_code == 204
    assert listed(client, card)["estimate"]["amount"] is None
    assert listed(client, card)["estimate"]["sample_count"] == 2


def test_owner_isolation_authentication_and_csrf(client, app):
    assert client.get("/api/estimates").status_code == 401
    access(client)
    card = add(client)
    sale = completed(client, card)
    payload = {
        key: sale[key]
        for key in (
            "sold_on",
            "price",
            "currency",
            "condition",
            "grader",
            "grade",
            "source",
            "source_url",
        )
    }
    payload["expected_definition_id"] = card["definition_id"]
    with app.state.sessions() as db:
        db.add(
            Account(
                username="other",
                password_hash=password_hasher.hash(PASSWORD),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
        access(other, "other")
        own = add(other)
        assert other.get("/api/estimates").json()["items"][0]["card_id"] == own["id"]
        assert other.get(f"/api/cards/{card['id']}/comparables").status_code == 404
        assert other.post(f"/api/cards/{card['id']}/comparables", json=payload).status_code == 404
        assert other.delete(f"/api/cards/{card['id']}/comparables/{sale['id']}").status_code == 404
        assert listed(other, own)["items"] == []
    client.headers.pop("X-CSRF-Token")
    assert client.post(f"/api/cards/{card['id']}/comparables", json=payload).status_code == 403
    assert client.delete(f"/api/cards/{card['id']}/comparables/{sale['id']}").status_code == 403


def test_source_input_is_text_only_not_a_network_fetch(client):
    access(client)
    card = add(client)
    completed(client, card, source_url="http://127.0.0.1:1/private")
    assert listed(client, card)["items"][0]["source_url"] == "http://127.0.0.1:1/private"
