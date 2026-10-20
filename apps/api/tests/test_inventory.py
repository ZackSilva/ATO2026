from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from slabtrak.app import COOKIE, create_app
from slabtrak.config import Settings
from slabtrak.models import Account, OwnedCopy
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_auth import login


def access(client, username="collector"):
    result = login(client, username)
    assert result.status_code == 200
    client.headers["X-CSRF-Token"] = result.json()["csrf_token"]


def add(client, **fields):
    result = client.post("/api/cards", json={"subject": "Isolated test card", **fields})
    assert result.status_code == 201, result.text
    return result.json()


def edit(card, **changes):
    computed = {
        "id",
        "definition_id",
        "created_at",
        "updated_at",
        "recorded_cost",
        "total_cost",
        "sale_net",
        "net_profit",
        "profit_after_costs",
        "photo_url",
        "photo_kind",
        "photo_source",
        "back_photo_url",
        "back_photo_kind",
        "back_photo_source",
    }
    return {key: value for key, value in card.items() if key not in computed} | changes


def test_duplicate_copies_share_identity_but_keep_grades_costs_and_edits_separate(client):
    access(client)
    first = add(
        client,
        year=2024,
        set_name="Test set",
        purchase_price="100.10",
        shipping="0.20",
        tax="0",
        other_cost="0",
    )
    second = add(
        client,
        year=2024,
        set_name="Test set",
        condition="graded",
        grader="BGS",
        grade="9.5",
        centering="9.5",
        purchase_price="0.00",
    )
    assert first["id"] != second["id"]
    assert first["definition_id"] == second["definition_id"]
    assert first["total_cost"] == "100.30"
    assert second["total_cost"] is None
    assert second["recorded_cost"] == "0.00"
    updated = client.put(f"/api/cards/{first['id']}", json=edit(first, subject="Corrected name"))
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    assert updated.json()["definition_id"] != second["definition_id"]
    sibling = client.get(f"/api/cards/{second['id']}").json()
    assert sibling["subject"] == "Isolated test card"
    assert sibling["grader"] == "BGS"
    assert sibling["centering"] == "9.5"


def test_unknown_zero_and_different_currencies_are_preserved(client):
    access(client)
    unknown = add(client)
    free = add(client, purchase_price="0", shipping="0", tax="0", other_cost="0", currency="CAD")
    assert unknown["purchase_price"] is None
    assert unknown["recorded_cost"] is None
    assert unknown["total_cost"] is None
    assert free["total_cost"] == "0.00"
    assert free["currency"] == "CAD"
    summary = client.get("/api/cards").json()["summary"]
    assert summary == {
        "active": 2,
        "raw": 2,
        "graded": 0,
        "archived": 0,
        "missing_price": 1,
        "sold": 0,
    }


def test_invalid_inventory_values_are_rejected_without_writing(client):
    access(client)
    for fields in (
        {"subject": " "},
        {"year": 1799},
        {"purchase_price": "-0.01"},
        {"purchase_price": "1.001"},
        {"purchase_price": "10000000000.00"},
        {"currency": "us"},
        {"acquired_on": "2026-02-30"},
        {"serial_number": 3, "print_run": 2},
        {"grade": "10"},
        {"condition": "graded"},
        {"condition": "graded", "grader": "PSA", "corners": "9"},
        {"condition": "graded", "grader": "BGS", "corners": "10.1"},
        {"raw_condition": "mint"},
        {"condition": "graded", "grader": "PSA", "raw_condition": "near_mint"},
        {"owner_id": str(uuid4())},
        {"definition_id": str(uuid4())},
    ):
        response = client.post("/api/cards", json={"subject": "Test", **fields})
        assert response.status_code == 422, fields
    assert client.get("/api/cards").json()["total"] == 0
    assert client.post("/api/cards", content=b"x" * 32769).status_code == 413


def test_raw_category_belongs_to_copy_and_survives_older_client_metadata_edits(client, app):
    access(client)
    card = add(client, raw_condition="near_mint")
    sibling = add(client, raw_condition="poor")
    assert sibling["definition_id"] == card["definition_id"]
    assert sibling["raw_condition"] == "poor"
    payload = edit(card, notes="Metadata from an older client")
    payload.pop("raw_condition")
    response = client.put(f"/api/cards/{card['id']}", json=payload)
    assert response.status_code == 200
    assert response.json()["raw_condition"] == "near_mint"
    assert response.json()["purchase_price"] is None
    with app.state.sessions() as db:
        with pytest.raises(IntegrityError):
            db.execute(
                text("UPDATE slabtrak.owned_copies SET raw_condition='mint' WHERE id=:id"),
                {"id": card["id"]},
            )
            db.commit()


def test_private_reads_writes_and_csrf(client):
    assert client.get("/api/cards").status_code == 401
    assert client.post("/api/cards", json={"subject": "Test"}).status_code == 401
    access(client)
    card = add(client)
    client.headers.pop("x-csrf-token")
    assert client.post("/api/cards", json={"subject": "Test"}).status_code == 403
    assert client.put(f"/api/cards/{card['id']}", json=edit(card)).status_code == 403
    assert client.delete(f"/api/cards/{card['id']}?revision=1").status_code == 403
    access(client)
    client.headers["Origin"] = "https://untrusted.example"
    assert client.post("/api/cards", json={"subject": "Test"}).status_code == 403
    client.headers.pop("origin")
    assert client.delete(f"/api/cards/{card['id']}?revision=1").status_code == 403


def test_other_collector_cannot_read_modify_or_reference_owned_cards(client, app):
    access(client)
    card = add(client)
    with app.state.sessions() as db:
        other_account = Account(
            username="second-collector",
            created_at=datetime.now(UTC),
            password_hash=password_hasher.hash(PASSWORD),
        )
        db.add(other_account)
        db.commit()
        other_id = other_account.id
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
        access(other, "second-collector")
        assert other.get("/api/cards").json()["total"] == 0
        assert other.get(f"/api/cards/{card['id']}").status_code == 404
        assert other.put(f"/api/cards/{card['id']}", json=edit(card)).status_code == 404
        assert other.delete(f"/api/cards/{card['id']}?revision=1").status_code == 404
        own = add(other)
        assert own["definition_id"] != card["definition_id"]
    # Even direct runtime-role SQL cannot link a copy to another owner's identity.
    with app.state.sessions() as db:
        with pytest.raises(IntegrityError):
            db.execute(
                text("UPDATE slabtrak.owned_copies SET owner_id=:owner WHERE id=:id"),
                {"owner": other_id, "id": card["id"]},
            )
            db.commit()


def test_archive_search_literal_wildcards_filters_sort_and_pagination(client):
    access(client)
    alpha = add(client, subject="Alpha 50%", year=2020)
    beta = add(
        client,
        subject="Beta",
        year=2024,
        condition="graded",
        grader="PSA",
        grade="10",
        certification="CERT-ABC",
        notes="Find my favorite",
        seller="Local shop",
    )
    add(client, subject="Gamma", archived=True)
    assert client.get("/api/cards?q=50%25").json()["total"] == 1
    assert client.get("/api/cards?q=_").json()["total"] == 0
    assert (
        client.get("/api/cards?q=FAVORITE&condition=graded").json()["items"][0]["id"] == beta["id"]
    )
    assert client.get("/api/cards?q=cert-abc").json()["total"] == 1
    assert client.get("/api/cards?sort=year&limit=1").json()["items"][0]["id"] == beta["id"]
    assert (
        client.get("/api/cards?sort=subject&offset=1&limit=1").json()["items"][0]["id"]
        == beta["id"]
    )
    assert client.get("/api/cards?status=archived").json()["total"] == 1
    archived = client.put(f"/api/cards/{alpha['id']}", json=edit(alpha, archived=True)).json()
    assert archived["archived"] is True
    assert client.get("/api/cards").json()["summary"]["archived"] == 2
    assert client.get("/api/cards?status=all").json()["total"] == 3
    assert (
        client.put(f"/api/cards/{alpha['id']}", json=edit(archived, archived=False)).status_code
        == 200
    )


def test_stale_edits_and_deletes_do_not_overwrite_newer_data(client):
    access(client)
    card = add(client)
    newer = client.put(f"/api/cards/{card['id']}", json=edit(card, notes="Newer edit")).json()
    assert (
        client.put(f"/api/cards/{card['id']}", json=edit(card, notes="Stale edit")).status_code
        == 409
    )
    assert client.delete(f"/api/cards/{card['id']}?revision=1").status_code == 409
    assert client.get(f"/api/cards/{card['id']}").json()["notes"] == "Newer edit"
    assert client.delete(f"/api/cards/{card['id']}?revision={newer['revision']}").status_code == 204
    assert client.get(f"/api/cards/{card['id']}").status_code == 404
    assert client.get("/api/cards").json()["total"] == 0


def test_concurrent_edit_allows_exactly_one_writer(client, app):
    access(client)
    card = add(client)
    token = client.cookies[COOKIE]
    csrf = client.headers["x-csrf-token"]

    def update(note):
        with TestClient(
            app, base_url=ORIGIN, headers={"Origin": ORIGIN, "X-CSRF-Token": csrf}
        ) as other:
            other.cookies.set(COOKIE, token)
            return other.put(f"/api/cards/{card['id']}", json=edit(card, notes=note)).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(update, ["First browser", "Second browser"])) == [200, 409]
    assert client.get(f"/api/cards/{card['id']}").json()["revision"] == 2


def test_inventory_survives_new_api_instance(client, app):
    access(client)
    card = add(client, notes="Persist this note", purchase_price="12.34")
    settings = Settings(
        database_url=app.state.engine.url.render_as_string(hide_password=False), app_origin=ORIGIN
    )
    with TestClient(create_app(settings), base_url=ORIGIN) as restarted:
        restarted.cookies.set(COOKIE, client.cookies[COOKIE])
        assert restarted.get(f"/api/cards/{card['id']}").json() == card
    with app.state.sessions() as db:
        assert (
            db.scalar(select(OwnedCopy).where(OwnedCopy.id == card["id"])).notes
            == "Persist this note"
        )
