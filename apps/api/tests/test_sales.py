"""Sales preserve exact money, ownership, and the existing copy revision boundary."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from slabtrak.app import COOKIE, create_app
from slabtrak.config import Settings
from slabtrak.models import Account
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_inventory import access, add, edit


@pytest.mark.parametrize(
    ("purchase", "price", "fees", "net", "profit"),
    [
        ("80.10", "100.30", "10.20", "90.10", "10.00"),
        ("0", "0", "0", "0.00", "0.00"),
        ("100", "90", "10", "80.00", "-20.00"),
        ("0.01", "0.10", "0.03", "0.07", "0.06"),
        ("5", "0", "12.34", "-12.34", "-17.34"),
    ],
)
def test_exact_sale_proceeds_and_profit_allow_zero_and_losses(
    client, purchase, price, fees, net, profit
):
    access(client)
    card = add(client, purchase_price=purchase, sold=True, sale_price=price, sale_fees=fees)
    assert card["sale_net"] == net
    assert card["net_profit"] == profit
    assert card["profit_after_costs"] is None


def test_unknown_purchase_and_incomplete_costs_never_become_zero(client):
    access(client)
    unknown = add(client, sold=True, sale_price="150", sale_fees="10")
    assert unknown["sale_net"] == "140.00"
    assert unknown["net_profit"] is None
    assert unknown["profit_after_costs"] is None
    partial = add(
        client, purchase_price="100", shipping="5", sold=True, sale_price="150", sale_fees="10"
    )
    assert partial["net_profit"] == "40.00"
    assert partial["profit_after_costs"] is None
    complete = client.put(
        f"/api/cards/{partial['id']}", json=edit(partial, tax="2.01", other_cost="0")
    ).json()
    assert complete["total_cost"] == "107.01"
    assert complete["profit_after_costs"] == "32.99"


@pytest.mark.parametrize(
    "fields",
    [
        {"sold": True},
        {"sold": True, "sale_price": "10"},
        {"sold": True, "sale_fees": "0"},
        {"sold": True, "sale_price": "0", "sale_fees": "0", "archived": True},
        {"sold": False, "sale_price": "0"},
        {"sold": False, "sale_fees": "0"},
        {"sold": False, "sold_on": "2026-10-20"},
        {"sold": True, "sale_price": "-0.01", "sale_fees": "0"},
        {"sold": True, "sale_price": "0", "sale_fees": "-0.01"},
        {"sold": True, "sale_price": "1.001", "sale_fees": "0"},
        {"sold": True, "sale_price": "0", "sale_fees": "1.001"},
        {"sold": True, "sale_price": "10000000000.00", "sale_fees": "0"},
        {"sold": True, "sale_price": "0", "sale_fees": "10000000000.00"},
        {"sold": True, "sale_price": "10", "sale_fees": "0", "sold_on": "2026-02-30"},
        {"sale_net": "10"},
        {"net_profit": "10"},
        {"profit_after_costs": "10"},
    ],
)
def test_invalid_or_client_computed_sales_are_rejected_without_writing(client, fields):
    access(client)
    result = client.post("/api/cards", json={"subject": "Test sale", **fields})
    assert result.status_code == 422, result.text
    assert client.get("/api/cards?status=all").json()["total"] == 0


def test_sell_correct_and_reverse_sale_preserve_grading_and_acquisition(client):
    access(client)
    card = add(client, condition="graded", grader="PSA", grade="9", purchase_price="10.01")
    sold_response = client.put(
        f"/api/cards/{card['id']}",
        json=edit(card, sold=True, sale_price="20", sale_fees="1", sold_on="2026-10-20"),
    )
    assert sold_response.status_code == 200
    sold = sold_response.json()
    assert sold["revision"] == 2
    assert sold["grader"] == "PSA"
    assert sold["grade"] == "9"
    assert sold["purchase_price"] == "10.01"
    assert sold["sold_on"] == "2026-10-20"
    corrected = client.put(f"/api/cards/{card['id']}", json=edit(sold, sale_fees="2.01")).json()
    assert corrected["sale_net"] == "17.99"
    assert corrected["net_profit"] == "7.98"
    reversed_response = client.put(
        f"/api/cards/{card['id']}",
        json=edit(corrected, sold=False, sale_price=None, sale_fees=None, sold_on=None),
    )
    assert reversed_response.status_code == 200
    reversed_card = reversed_response.json()
    for name in (
        "sale_price",
        "sale_fees",
        "sold_on",
        "sale_net",
        "net_profit",
        "profit_after_costs",
    ):
        assert reversed_card[name] is None
    assert reversed_card["purchase_price"] == "10.01"
    assert client.get("/api/cards").json()["total"] == 1


def test_legacy_metadata_edit_keeps_sale_and_rejects_archiving_sold_card(client):
    access(client)
    card = add(client, sold=True, sale_price="50", sale_fees="5", sold_on="2026-10-20")
    legacy = edit(card, notes="Updated by a client without sale fields")
    for name in ("sold", "sale_price", "sale_fees", "sold_on"):
        legacy.pop(name)
    result = client.put(f"/api/cards/{card['id']}", json=legacy)
    assert result.status_code == 200, result.text
    updated = result.json()
    assert updated["sold"] is True
    assert updated["sale_price"] == "50.00"
    assert updated["sale_fees"] == "5.00"
    assert updated["sold_on"] == "2026-10-20"
    assert updated["notes"] == legacy["notes"]
    legacy.update(revision=updated["revision"], archived=True)
    assert client.put(f"/api/cards/{card['id']}", json=legacy).status_code == 422
    assert client.get(f"/api/cards/{card['id']}").json() == updated


def test_sold_filters_and_summary_exclude_sales_from_active_collection(client):
    access(client)
    active_raw = add(client, subject="Active raw")
    add(client, subject="Active graded", condition="graded", grader="PSA", purchase_price="0")
    add(client, subject="Archive", archived=True)
    sold_raw = add(client, subject="Sold raw", sold=True, sale_price="50", sale_fees="1")
    sold_graded = add(
        client,
        subject="Sold PSA",
        condition="graded",
        grader="PSA",
        grade="9",
        sold=True,
        sale_price="50",
        sale_fees="1",
    )
    active = client.get("/api/cards").json()
    assert active["total"] == 2
    assert active["summary"] == {
        "active": 2,
        "raw": 1,
        "graded": 1,
        "archived": 1,
        "missing_price": 1,
        "sold": 2,
    }
    assert active_raw["id"] in {card["id"] for card in active["items"]}
    sold = client.get("/api/cards?status=sold").json()
    assert {card["id"] for card in sold["items"]} == {sold_raw["id"], sold_graded["id"]}
    assert (
        client.get("/api/cards?status=sold&condition=graded").json()["items"][0]["id"]
        == sold_graded["id"]
    )
    assert (
        client.get("/api/cards?status=sold&condition=raw").json()["items"][0]["id"]
        == sold_raw["id"]
    )
    assert client.get("/api/cards?status=archived").json()["total"] == 1
    assert client.get("/api/cards?status=all").json()["total"] == 5


def test_sale_revision_rejects_stale_metadata_and_concurrent_sale(client, app):
    access(client)
    card = add(client)
    token, csrf = client.cookies[COOKIE], client.headers["x-csrf-token"]

    def sell(price):
        with TestClient(
            app, base_url=ORIGIN, headers={"Origin": ORIGIN, "X-CSRF-Token": csrf}
        ) as other:
            other.cookies.set(COOKIE, token)
            return other.put(
                f"/api/cards/{card['id']}",
                json=edit(card, sold=True, sale_price=price, sale_fees="1"),
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(sell, ["50", "60"])) == [200, 409]
    assert client.put(f"/api/cards/{card['id']}", json=edit(card, notes="stale")).status_code == 409
    saved = client.get(f"/api/cards/{card['id']}").json()
    assert saved["revision"] == 2
    assert saved["sold"] is True
    assert saved["sale_price"] in ("50.00", "60.00")


def test_sales_remain_private_and_require_csrf(client, app):
    access(client)
    card = add(client, sold=True, sale_price="25", sale_fees="0")
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
        assert other.get(f"/api/cards/{card['id']}").status_code == 401
        access(other, "other")
        assert other.get("/api/cards?status=sold").json()["summary"]["sold"] == 0
        assert other.get(f"/api/cards/{card['id']}").status_code == 404
        assert (
            other.put(f"/api/cards/{card['id']}", json=edit(card, sale_price="100")).status_code
            == 404
        )
    client.headers.pop("x-csrf-token")
    assert (
        client.put(f"/api/cards/{card['id']}", json=edit(card, sale_price="100")).status_code == 403
    )
    assert client.get(f"/api/cards/{card['id']}").json() == card


def test_sale_survives_api_restart(client, app):
    access(client)
    card = add(client, sold=True, sale_price="100.01", sale_fees="12.02", purchase_price="80.00")
    settings = Settings(
        database_url=app.state.engine.url.render_as_string(hide_password=False), app_origin=ORIGIN
    )
    with TestClient(create_app(settings), base_url=ORIGIN) as restarted:
        restarted.cookies.set(COOKIE, client.cookies[COOKIE])
        assert restarted.get(f"/api/cards/{card['id']}").json() == card


@pytest.mark.parametrize(
    "assignment",
    [
        "sold=true",
        "sale_price=0",
        "sale_fees=0",
        "sold_on='2026-10-20'",
        "sold=true, sale_price=-1, sale_fees=0",
        "sold=true, sale_price=1, sale_fees=-1",
        "sold=true, sale_price=1, sale_fees=0, archived=true",
    ],
)
def test_database_rejects_invalid_sale_states_outside_api(client, app, assignment):
    access(client)
    card = add(client)
    with app.state.sessions() as db:
        with pytest.raises(IntegrityError):
            db.execute(
                text(f"UPDATE slabtrak.owned_copies SET {assignment} WHERE id=:id"),
                {"id": card["id"]},
            )
            db.commit()
    assert client.get(f"/api/cards/{card['id']}").json() == card
