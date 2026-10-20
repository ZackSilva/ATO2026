"""Financial reports use current private records, never fictional valuation data."""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient

from slabtrak import finances
from slabtrak.models import Account
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_inventory import access, add, edit

TODAY = date(2026, 10, 20)


@pytest.fixture
def dated_client(client, monkeypatch):
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, 20, 12, tzinfo=UTC)

    monkeypatch.setattr(finances, "datetime", FixedDatetime)
    access(client)
    return client


def report(client, period="all"):
    response = client.get(f"/api/finances?range={period}")
    assert response.status_code == 200, response.text
    return response.json()


def expected(amount, known, complete=None, total=None):
    return {
        "amount": amount,
        "known_count": known,
        "complete_count": known if complete is None else complete,
        "total_count": known if total is None else total,
    }


def test_empty_report_is_not_demo_data_and_rejects_invalid_range(dated_client):
    assert report(dated_client) == {
        "range": "all",
        "as_of": "2026-10-20",
        "start_date": None,
        "end_date": "2026-10-20",
        "currencies": [],
    }
    assert dated_client.get("/api/finances?range=2y").status_code == 422


def test_exact_totals_currency_separation_archives_and_cost_coverage(dated_client):
    add(
        dated_client,
        purchase_price="80.10",
        shipping="0.20",
        tax="0",
        other_cost="0",
        sold=True,
        sale_price="100.30",
        sale_fees="10.20",
        acquired_on="2026-10-01",
        sold_on="2026-10-20",
    )
    add(
        dated_client,
        purchase_price="5",
        shipping="0",
        tax="0",
        other_cost="0",
        sold=True,
        sale_price="0",
        sale_fees="12.34",
        sold_on="2026-10-20",
    )
    add(dated_client, purchase_price="10", sold=True, sale_price="8", sale_fees="1")
    add(dated_client, sold=True, sale_price="1", sale_fees="0")
    add(dated_client, purchase_price="2.01", archived=True)
    add(dated_client)
    add(dated_client, currency="CAD", purchase_price="0", shipping="0", tax="0", other_cost="0")
    data = report(dated_client)
    assert [item["currency"] for item in data["currencies"]] == ["CAD", "USD"]
    cad, usd = data["currencies"]
    assert cad["metrics"]["acquisition_spending"] == expected("0.00", 1)
    metrics = usd["metrics"]
    assert metrics["acquisition_spending"] == expected("97.31", 4, 2, 6)
    assert metrics["owned_cost"] == expected("2.01", 1, 0, 2)
    assert metrics["gross_sales"] == expected("109.30", 4)
    assert metrics["sale_fees"] == expected("23.54", 4)
    assert metrics["net_sales"] == expected("85.76", 4)
    assert metrics["profit_vs_purchase"] == expected("-10.34", 3, total=4)
    assert metrics["realized_profit"] == expected("-7.54", 2, total=4)
    assert [point["date"] for point in usd["series"]] == ["2026-10-01", "2026-10-20"]
    assert usd["series"][1]["metrics"]["net_sales"] == expected("77.76", 2)
    assert "owned_cost" not in usd["series"][0]["metrics"]


def test_unknown_costs_are_null_while_empty_cash_flows_and_recorded_zero_are_zero(dated_client):
    add(dated_client, sold=True, sale_price="0", sale_fees="0", sold_on="2026-10-20")
    add(dated_client)
    metrics = report(dated_client)["currencies"][0]["metrics"]
    assert metrics["acquisition_spending"] == expected(None, 0, 0, 2)
    assert metrics["owned_cost"] == expected(None, 0, 0, 1)
    assert metrics["profit_vs_purchase"] == expected(None, 0, 0, 1)
    assert metrics["realized_profit"] == expected(None, 0, 0, 1)
    assert metrics["gross_sales"] == expected("0.00", 1)
    assert metrics["sale_fees"] == expected("0.00", 1)
    assert metrics["net_sales"] == expected("0.00", 1)
    before_sale = report(dated_client, "1m")["currencies"][0]["series"][0]
    assert before_sale["metrics"]["acquisition_spending"] == expected("0.00", 0)


def test_period_uses_sale_date_and_original_cost_even_when_purchase_is_outside_window(dated_client):
    add(
        dated_client,
        purchase_price="40.10",
        shipping="2",
        tax="0.30",
        other_cost="0",
        acquired_on="2024-01-01",
        sold=True,
        sale_price="60",
        sale_fees="5",
        sold_on="2026-10-14",
    )
    add(dated_client, purchase_price="2", acquired_on="2026-10-13")
    add(dated_client, purchase_price="3", acquired_on="2026-10-14", archived=True)
    data = report(dated_client, "1w")
    assert data["start_date"] == "2026-10-14"
    metrics = data["currencies"][0]["metrics"]
    assert metrics["acquisition_spending"] == expected("3.00", 1, 0, 1)
    assert metrics["owned_cost"] == expected("5.00", 2, 0, 2)
    assert metrics["profit_vs_purchase"] == expected("14.90", 1)
    assert metrics["realized_profit"] == expected("12.60", 1)
    assert [point["date"] for point in data["currencies"][0]["series"]] == ["2026-10-14"]


def test_undated_and_future_flags_are_separate_and_owned_cost_is_current_snapshot(dated_client):
    add(dated_client, purchase_price="10", sold=True, sale_price="20", sale_fees="1")
    add(
        dated_client,
        purchase_price="2",
        acquired_on="2026-10-21",
        sold=True,
        sale_price="9",
        sale_fees="1",
        sold_on="2026-10-21",
    )
    add(dated_client, purchase_price="3", acquired_on="2026-10-21", archived=True)
    all_time = report(dated_client)["currencies"][0]
    bounded = report(dated_client, "1m")["currencies"][0]
    for item in (all_time, bounded):
        assert item["undated_acquisitions"] == 1
        assert item["undated_sales"] == 1
        assert item["future_acquisitions"] == 2
        assert item["future_sales"] == 1
        assert item["metrics"]["owned_cost"] == expected("3.00", 1, 0, 1)
        assert item["series"] == []
    assert all_time["metrics"]["acquisition_spending"] == expected("10.00", 1, 0, 1)
    assert all_time["metrics"]["net_sales"] == expected("19.00", 1)
    assert bounded["metrics"]["acquisition_spending"] == expected("0.00", 0)
    assert bounded["metrics"]["net_sales"] == expected("0.00", 0)


@pytest.mark.parametrize(
    ("period", "today", "start"),
    [
        ("all", date(2026, 10, 20), None),
        ("1w", date(2026, 10, 20), date(2026, 10, 14)),
        ("1m", date(2026, 3, 31), date(2026, 2, 28)),
        ("1m", date(2024, 3, 31), date(2024, 2, 29)),
        ("3m", date(2026, 5, 31), date(2026, 2, 28)),
        ("6m", date(2026, 8, 31), date(2026, 2, 28)),
        ("1y", date(2024, 2, 29), date(2023, 2, 28)),
    ],
)
def test_calendar_ranges_clamp_month_end_and_leap_day(period, today, start):
    assert finances.range_start(period, today) == start


def test_utc_today_is_inclusive_but_tomorrow_is_not(dated_client):
    add(
        dated_client,
        purchase_price="1",
        acquired_on="2026-10-20",
        sold=True,
        sale_price="2",
        sale_fees="0",
        sold_on="2026-10-20",
    )
    add(
        dated_client,
        purchase_price="3",
        acquired_on="2026-10-21",
        sold=True,
        sale_price="4",
        sale_fees="0",
        sold_on="2026-10-21",
    )
    usd = report(dated_client, "1w")["currencies"][0]
    assert usd["metrics"]["acquisition_spending"] == expected("1.00", 1, 0, 1)
    assert usd["metrics"]["gross_sales"] == expected("2.00", 1)
    assert [point["date"] for point in usd["series"]] == ["2026-10-20"]


def test_summary_ignores_collection_filters_pagination_and_does_not_change_records(dated_client):
    before = [
        add(dated_client, subject=f"Card {number}", purchase_price="0.01") for number in range(52)
    ]
    response = dated_client.get("/api/finances?search=missing&status=sold&limit=1&offset=99")
    assert response.status_code == 200
    usd = response.json()["currencies"][0]
    assert usd["metrics"]["acquisition_spending"] == expected("0.52", 52, 0, 52)
    after = [dated_client.get(f"/api/cards/{card['id']}").json() for card in before]
    assert after == before
    assert response.headers["cache-control"] == "no-store"


def test_finances_are_authenticated_and_scoped_to_account(dated_client, app):
    add(dated_client, purchase_price="123.45", sold=True, sale_price="200", sale_fees="1")
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
        assert other.get("/api/finances").status_code == 401
        access(other, "other")
        assert report(other)["currencies"] == []
        add(other, currency="EUR", purchase_price="7")
        assert [item["currency"] for item in report(other)["currencies"]] == ["EUR"]
    assert [item["currency"] for item in report(dated_client)["currencies"]] == ["USD"]


def test_corrections_sale_reversal_and_deletion_update_current_record_totals(dated_client):
    card = add(
        dated_client,
        purchase_price="10",
        shipping="0",
        tax="0",
        other_cost="0",
        sold=True,
        sale_price="20",
        sale_fees="1",
        sold_on="2026-10-20",
    )
    corrected = dated_client.put(f"/api/cards/{card['id']}", json=edit(card, sale_fees="2")).json()
    assert report(dated_client)["currencies"][0]["metrics"]["realized_profit"]["amount"] == "8.00"
    reversed_card = dated_client.put(
        f"/api/cards/{card['id']}",
        json=edit(corrected, sold=False, sale_price=None, sale_fees=None, sold_on=None),
    ).json()
    usd = report(dated_client)["currencies"][0]
    assert usd["metrics"]["gross_sales"] == expected("0.00", 0)
    assert usd["metrics"]["owned_cost"] == expected("10.00", 1)
    assert usd["series"] == []
    assert (
        dated_client.delete(
            f"/api/cards/{card['id']}?revision={reversed_card['revision']}"
        ).status_code
        == 204
    )
    assert report(dated_client)["currencies"] == []
