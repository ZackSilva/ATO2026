"""Isolated automatic valuation contracts; provider payloads are synthetic, never live."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from slabtrak import market_links, market_values
from slabtrak.models import Account, ComparableSale, MarketLink, OwnedCopy
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_estimates import completed, listed
from tests.test_inventory import access, add, edit

NOW = datetime(2026, 10, 20, 12, tzinfo=UTC)
KEY = "isolated-market-values-key"
CARD_ID, SET_ID, RELEASE_ID, PARALLEL_ID = (str(uuid4()) for _ in range(4))
COMPANY_ID, TYPE_ID, GRADE_ID, OTHER_GRADE_ID = (str(uuid4()) for _ in range(4))
SPORT_ID, MAKER_ID = (str(uuid4()) for _ in range(2))
IMAGE = "https://i.ebayimg.com/images/g/isolated/s-l1600.jpg"


def catalog(**changes):
    return {
        "id": CARD_ID,
        "name": "Michael Jordan",
        "number": "57",
        "releaseId": RELEASE_ID,
        "setId": SET_ID,
        "releaseName": "Fleer",
        "releaseYear": "1986",
        "setName": "Base",
        "isParallelOnly": False,
        "parallelCount": 0,
        "parallels": [],
        **changes,
    }


def record(price="100", days=1, **changes):
    return {
        "title": "1986 Fleer Michael Jordan #57",
        "price": price,
        "date": (NOW - timedelta(days=days)).isoformat(),
        "source": "ebay",
        "listing_type": "auction",
        "url": f"https://www.ebay.com/itm/{uuid4()}",
        "image_url": IMAGE,
        "parallel_id": None,
        "parallel_name": None,
        **changes,
    }


def pricing(records=None, grade_id=None, card_id=CARD_ID):
    records = records if records is not None else [record(p) for p in ("90", "100", "110")]
    group = {
        "grade_value": "9",
        "grade_id": grade_id,
        "period_days": None,
        "count": len(records),
        "records": records,
    }
    return {
        "card": {
            "card_id": card_id,
            "name": "Michael Jordan",
            "number": "57",
            "set": {"set_id": SET_ID, "name": "Base", "year": "1986", "release": "Fleer"},
            "parallel": None,
        },
        "query": {
            "parallel_id": None,
            "grade_id": grade_id,
            "listing_type": "auction",
            "period": "all",
            "as_of_date": NOW.date().isoformat(),
        },
        "raw": {
            "period_days": None,
            "count": 0 if grade_id else len(records),
            "records": [] if grade_id else records,
        },
        "graded": [{"company_id": COMPANY_ID, "company_name": "PSA", "grades": [group]}]
        if grade_id
        else [],
        "meta": {"sources": [], "total_records": len(records)},
    }


@pytest.fixture(autouse=True)
def provider(monkeypatch):
    """Return realistic catalog/grade shapes and keep a count of all outbound requests."""
    monkeypatch.setenv("CARDSIGHT_API_KEY", KEY)
    monkeypatch.setattr(market_values, "now_utc", lambda: NOW)
    monkeypatch.setattr(market_links, "now_utc", lambda: NOW)
    company = {"id": COMPANY_ID, "name": "PSA", "description": None}
    kind = {
        "id": TYPE_ID,
        "name": "Regular",
        "gradingCompanyId": COMPANY_ID,
        "gradingCompanyName": "PSA",
        "description": None,
    }
    grade = {
        "id": GRADE_ID,
        "gradingTypeId": TYPE_ID,
        "gradingTypeName": "Regular",
        "gradingCompanyId": COMPANY_ID,
        "gradingCompanyName": "PSA",
        "grade": "9",
        "condition": "MINT",
    }
    state = {
        "calls": [],
        "cards": [catalog()],
        "detail": catalog(),
        "details": {},
        "release": {
            "id": RELEASE_ID,
            "name": "Fleer",
            "year": "1986",
            "segmentId": SPORT_ID,
            "manufacturerId": MAKER_ID,
            "is_identifiable": False,
            "sets": [],
        },
        "segments": [{"id": SPORT_ID, "name": "Basketball"}],
        "manufacturers": [{"id": MAKER_ID, "name": "Fleer"}],
        "companies": [company],
        "types": [kind],
        "grades": [grade],
        "grades_by_type": {},
        "pricing": pricing(),
        "pricing_by_card": {},
        "error": None,
    }

    def fetch(key, path, params=None, body=None):
        assert key == KEY
        state["calls"].append((path, deepcopy(params), deepcopy(body)))
        if path == "/v1/catalog/cards":
            return {
                "cards": state["cards"],
                "total_count": len(state["cards"]),
                "take": 20,
                "skip": 0,
            }
        if path.startswith("/v1/catalog/cards/"):
            return deepcopy(state["details"].get(path.rsplit("/", 1)[-1], state["detail"]))
        if path.startswith("/v1/catalog/releases/"):
            return deepcopy(state["release"])
        if path in ("/v1/catalog/segments", "/v1/catalog/manufacturers"):
            field = path.rsplit("/", 1)[-1]
            return {
                field: deepcopy(state[field]),
                "total_count": len(state[field]),
                "take": 20,
                "skip": 0,
            }
        if path == "/v1/grades/companies":
            return {"companies": state["companies"], "total": len(state["companies"])}
        if path.endswith("/types"):
            return {
                "types": state["types"],
                "total": len(state["types"]),
                "gradingCompany": company,
            }
        if path.endswith("/grades"):
            selected_kind = next(
                item for item in state["types"] if item["id"] == path.split("/")[-2]
            )
            selected_grades = state["grades_by_type"].get(selected_kind["id"], state["grades"])
            return {
                "grades": selected_grades,
                "total": len(selected_grades),
                "gradingType": selected_kind,
                "gradingCompany": state["companies"][0],
            }
        if path.startswith("/v1/pricing/"):
            if state["error"]:
                raise state["error"]
            if body:
                return {
                    "results": [
                        {
                            "card_id": card_id,
                            "success": True,
                            "data": deepcopy(state["pricing_by_card"][card_id]),
                        }
                        for card_id in body["card_ids"]
                    ],
                    "meta": {
                        "requested": len(body["card_ids"]),
                        "successful": len(body["card_ids"]),
                        "failed": 0,
                    },
                }
            return deepcopy(state["pricing_by_card"].get(path.rsplit("/", 1)[-1], state["pricing"]))
        pytest.fail(f"Unexpected provider path: {path}")

    monkeypatch.setattr(market_values, "fetch_json", fetch)
    return state


def card(client, **changes):
    return add(
        client,
        **{
            "subject": "Michael Jordan",
            "year": 1986,
            "set_name": "Fleer",
            "card_number": "57",
            **changes,
        },
    )


def link_body(copy, **changes):
    return {
        "expected_definition_id": copy["definition_id"],
        "expected_card_id": None,
        "card_id": CARD_ID,
        "grade_id": None,
        **changes,
    }


def link(client, copy, **changes):
    response = client.post(f"/api/cards/{copy['id']}/market-link", json=link_body(copy, **changes))
    assert response.status_code in (200, 201), response.text
    return response.json()


def estimate(client, copy):
    response = client.get("/api/estimates")
    assert response.status_code == 200, response.text
    return next(item for item in response.json()["items"] if item["card_id"] == copy["id"])


def pricing_calls(provider):
    return [call for call in provider["calls"] if call[0].startswith("/v1/pricing/")]


def test_mapping_requires_authentication_and_csrf_before_provider_access(client, provider):
    missing = str(uuid4())
    assert client.get(f"/api/cards/{missing}/market-link").status_code == 401
    assert client.post(f"/api/cards/{missing}/market-link", json={}).status_code == 401
    access(client)
    copy = card(client)
    token = client.headers.pop("x-csrf-token")
    for suffix, body in (
        ("market-link/candidates", {"expected_definition_id": copy["definition_id"]}),
        ("market-link", link_body(copy)),
        ("market-link/refresh", {}),
    ):
        assert client.post(f"/api/cards/{copy['id']}/{suffix}", json=body).status_code == 403
    assert (
        client.request(
            "DELETE", f"/api/cards/{copy['id']}/market-link", json=link_body(copy)
        ).status_code
        == 403
    )
    assert provider["calls"] == []
    client.headers["x-csrf-token"] = token
    assert client.get(f"/api/cards/{copy['id']}/market-link").json()["configured"] is True


def test_other_collector_cannot_inspect_link_refresh_or_unlink(client, app, provider):
    access(client)
    copy = card(client)
    with app.state.sessions() as db:
        db.add(
            Account(username="other", password_hash=password_hasher.hash(PASSWORD), created_at=NOW)
        )
        db.commit()
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
        access(other, "other")
        base = f"/api/cards/{copy['id']}/market-link"
        assert other.get(base).status_code == 404
        assert (
            other.post(
                base + "/candidates", json={"expected_definition_id": copy["definition_id"]}
            ).status_code
            == 404
        )
        assert other.post(base, json=link_body(copy)).status_code == 404
        assert other.post(base + "/refresh", json={}).status_code == 404
        assert (
            other.request(
                "DELETE",
                base,
                json={"expected_definition_id": copy["definition_id"], "expected_card_id": None},
            ).status_code
            == 404
        )
    assert provider["calls"] == []


@pytest.mark.parametrize(
    "change",
    [
        {"releaseYear": "1987"},
        {"number": "58"},
        {"name": "Michael Jordan Jr."},
        {"releaseName": "Fleer Sticker"},
    ],
)
def test_candidates_reject_close_but_different_identities(client, provider, change):
    access(client)
    copy = card(client)
    provider["cards"] = [catalog(**change)]
    response = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert response.status_code == 200, response.text
    assert not any(candidate["eligible"] for candidate in response.json()["candidates"])
    provider["detail"] = catalog(**change)
    assert (
        client.post(f"/api/cards/{copy['id']}/market-link", json=link_body(copy)).status_code == 422
    )


def test_link_is_copy_specific_preserves_finances_and_checks_expected_identity(
    client, app, provider
):
    access(client)
    copy = card(client, purchase_price=None)
    sibling = card(client, condition="graded", grader="PSA", grade="9")
    before = client.get(f"/api/cards/{copy['id']}").json()
    link(client, copy)
    current = client.get(f"/api/cards/{copy['id']}/market-link").json()["link"]
    assert current["card_id"] == CARD_ID and current["valid"] is True
    assert current["parallel_id"] is None and current["grade_id"] is None
    assert client.get(f"/api/cards/{sibling['id']}/market-link").json()["link"] is None
    assert client.get(f"/api/cards/{copy['id']}").json() == before
    assert (
        client.post(
            f"/api/cards/{copy['id']}/market-link",
            json=link_body(copy, expected_definition_id=str(uuid4()), expected_card_id=CARD_ID),
        ).status_code
        == 409
    )
    assert (
        client.request(
            "DELETE",
            f"/api/cards/{copy['id']}/market-link",
            json={
                "expected_definition_id": copy["definition_id"],
                "expected_card_id": str(uuid4()),
            },
        ).status_code
        == 409
    )
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(ComparableSale)) == 0
    assert KEY not in str(current)


@pytest.mark.parametrize(
    "changes",
    [{"grade": "10"}, {"subject": "Corrected Jordan"}, {"currency": "CAD"}, {"parallel": "Gold"}],
)
def test_copy_signature_edit_invalidates_mapping_without_erasing_it(client, provider, changes):
    access(client)
    copy = card(client, condition="graded", grader="PSA", grade="9")
    provider["pricing"] = pricing(grade_id=GRADE_ID)
    link(client, copy, grade_id=GRADE_ID)
    response = client.put(f"/api/cards/{copy['id']}", json=edit(copy, **changes))
    assert response.status_code == 200, response.text
    current = client.get(f"/api/cards/{copy['id']}/market-link").json()["link"]
    assert current is not None and current["valid"] is False
    value = estimate(client, copy)
    assert value["amount"] is None and value["pricing_status"] == "mismatch"


@pytest.mark.parametrize("graded", [False, True])
def test_live_estimates_use_exact_sales_and_preserve_unknown_costs(client, app, provider, graded):
    access(client)
    copy = card(
        client, **({"condition": "graded", "grader": "PSA", "grade": "9"} if graded else {})
    )
    good = [record(p, days=d) for p, d in (("10.01", 0), ("20.03", 179), ("15.02", 1))]
    bad = [
        record("999", days=180),
        record("999", days=-1),
        record("999", listing_type="fixed"),
        record("NaN"),
        record("1.001"),
        record("999", parallel_id=PARALLEL_ID, parallel_name="Gold"),
    ]
    provider["pricing"] = pricing(good + bad, grade_id=GRADE_ID if graded else None)
    if graded:
        provider["pricing"]["graded"][0]["grades"].append(
            {
                "grade_id": OTHER_GRADE_ID,
                "grade_value": "10",
                "period_days": None,
                "count": 1,
                "records": [record("9999")],
            }
        )
    link(client, copy, grade_id=GRADE_ID if graded else None)
    value = estimate(client, copy)
    assert value["source"] == "cardsight" and value["pricing_status"] == "live"
    assert (value["amount"], value["low"], value["high"], value["sample_count"]) == (
        "15.02",
        "10.01",
        "20.03",
        3,
    )
    assert value["fetched_at"] and value["refresh_after"]
    data = listed(client, copy)
    assert data["estimate"]["source"] == "cardsight"
    assert len(data["matching_sale_ids"]) == 4  # Older exact sales remain historical evidence.
    assert all(item["source_url"].startswith("https://www.ebay.com/") for item in data["items"])
    assert all(item["image_url"] == IMAGE for item in data["items"])
    assert client.get(f"/api/cards/{copy['id']}").json()["purchase_price"] is None
    assert data["saved_history"]["items"] == []
    with app.state.sessions() as db:
        assert db.scalar(select(func.count()).select_from(ComparableSale)) == 0
    call = pricing_calls(provider)[0]
    assert call[1]["parallel_id"] == "null"
    assert call[1]["grade_id"] == (GRADE_ID if graded else "null")
    assert call[1]["listing_type"] == "auction"


def test_unlinked_uses_saved_evidence_but_empty_linked_does_not_fallback(client, provider):
    access(client)
    copy = card(client)
    for price in ("10", "20", "30"):
        completed(client, copy, price)
    saved = listed(client, copy)
    assert saved["estimate"]["amount"] == "20.00"
    assert estimate(client, copy)["source"] == "saved"
    assert provider["calls"] == []
    provider["pricing"] = pricing([])
    link(client, copy)
    linked = listed(client, copy)
    assert linked["estimate"]["amount"] is None
    assert linked["estimate"]["pricing_status"] == "insufficient"
    assert linked["saved_history"]["items"] == saved["items"]
    assert linked["items"] == []


def test_provider_failure_is_unavailable_without_relabeling_saved_prices(client, provider):
    access(client)
    copy = card(client)
    for price in ("10", "20", "30"):
        completed(client, copy, price)
    link(client, copy)
    provider["error"] = HTTPException(status_code=503, detail="Provider unavailable")
    # Explicit refresh discards any successful earlier request before returning failure state.
    response = client.post(f"/api/cards/{copy['id']}/market-link/refresh", json={})
    assert response.status_code in (200, 503), response.text
    value = estimate(client, copy)
    assert value["amount"] is None and value["pricing_status"] == "unavailable"
    assert len(listed(client, copy)["saved_history"]["items"]) == 3
    assert KEY not in response.text


def test_repeat_reads_use_short_cache_and_expiry_never_keeps_old_live_amount(
    client, provider, monkeypatch
):
    access(client)
    copy = card(client)
    link(client, copy)
    assert estimate(client, copy)["amount"] == "100.00"
    count = len(pricing_calls(provider))
    for _ in range(3):
        assert estimate(client, copy)["amount"] == "100.00"
        assert listed(client, copy)["estimate"]["amount"] == "100.00"
    assert len(pricing_calls(provider)) == count
    monkeypatch.setattr(
        market_values, "now_utc", lambda: NOW + market_values.MAX_CACHE_AGE + timedelta(seconds=1)
    )
    provider["error"] = HTTPException(status_code=503, detail="Provider unavailable")
    expired = estimate(client, copy)
    assert expired["amount"] is None and expired["pricing_status"] == "unavailable"
    assert len(pricing_calls(provider)) == count + 1


def test_variant_match_is_exact_and_price_filter_is_derived_from_confirmed_identity(
    client, provider
):
    access(client)
    copy = card(client, parallel="Gold", print_run=50)
    provider["cards"] = [catalog(parallelCount=1)]
    provider["detail"] = catalog(
        parallelCount=1,
        parallels=[{"id": PARALLEL_ID, "name": "Gold", "numberedTo": 50}],
    )
    response = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["candidates"][0]["parallel_id"] == PARALLEL_ID
    assert response.json()["candidates"][0]["eligible"] is True
    provider["pricing"] = pricing(
        [record(p, parallel_id=PARALLEL_ID, parallel_name="Gold") for p in ("10", "20", "30")]
    )
    provider["pricing"]["query"]["parallel_id"] = PARALLEL_ID
    provider["pricing"]["card"]["parallel"] = {"parallel_id": PARALLEL_ID, "name": "Gold"}
    link(client, copy)
    assert (
        client.get(f"/api/cards/{copy['id']}/market-link").json()["link"]["parallel_id"]
        == PARALLEL_ID
    )
    assert estimate(client, copy)["amount"] == "20.00"
    assert pricing_calls(provider)[0][1]["parallel_id"] == PARALLEL_ID


def test_grade_requires_explicit_catalog_option_and_never_uses_another_grade_id(client, provider):
    access(client)
    copy = card(client, condition="graded", grader="PSA", grade="9")
    response = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert response.status_code == 200, response.text
    assert [option["id"] for option in response.json()["grade_options"]] == [GRADE_ID]
    for grade_id in (None, OTHER_GRADE_ID):
        failed = client.post(
            f"/api/cards/{copy['id']}/market-link", json=link_body(copy, grade_id=grade_id)
        )
        assert failed.status_code == 422, failed.text
    assert pricing_calls(provider) == []


def test_raw_condition_category_is_not_invented_from_provider_ungraded_group(client, provider):
    access(client)
    copy = card(client, raw_condition="near_mint")
    link(client, copy)
    result = estimate(client, copy)
    assert result["amount"] is None
    assert result["pricing_status"] == "insufficient"
    assert "condition" in (result["pricing_note"] or result["reason"]).lower()


def test_unlink_retains_saved_evidence_and_requires_current_mapping(client, provider):
    access(client)
    copy = card(client)
    completed(client, copy, "10")
    saved = listed(client, copy)
    link(client, copy)
    confirmed = client.get(f"/api/cards/{copy['id']}/market-link").json()["link"]["confirmed_at"]
    response = client.request(
        "DELETE",
        f"/api/cards/{copy['id']}/market-link",
        json={
            "expected_definition_id": copy["definition_id"],
            "expected_card_id": CARD_ID,
            "expected_confirmed_at": confirmed,
        },
    )
    assert response.status_code in (200, 204), response.text
    assert client.get(f"/api/cards/{copy['id']}/market-link").json()["link"] is None
    assert listed(client, copy)["items"] == saved["items"]
    assert estimate(client, copy)["source"] == "saved"


def test_same_card_copies_keep_distinct_raw_and_graded_provider_filters(client, provider):
    access(client)
    raw = card(client)
    graded = card(client, condition="graded", grader="PSA", grade="9")
    assert raw["definition_id"] == graded["definition_id"]
    link(client, raw)
    assert estimate(client, raw)["amount"] == "100.00"
    provider["pricing"] = pricing([record(p) for p in ("900", "1000", "1100")], grade_id=GRADE_ID)
    link(client, graded, grade_id=GRADE_ID)
    assert estimate(client, graded)["amount"] == "1000.00"
    assert estimate(client, raw)["amount"] == "100.00"
    calls = pricing_calls(provider)
    assert len(calls) == 2
    assert {call[1]["grade_id"] for call in calls} == {"null", GRADE_ID}


def test_equal_numeric_grades_keep_label_types_distinct_in_confirmation(client, provider):
    access(client)
    copy = card(client, condition="graded", grader="BGS", grade="10")
    other_type = str(uuid4())
    provider["companies"][0]["name"] = "BGS"
    provider["types"][0].update(name="Standard", gradingCompanyName="BGS")
    provider["types"].append({**provider["types"][0], "id": other_type, "name": "Black Label"})
    standard = {
        **provider["grades"][0],
        "grade": "10",
        "gradingCompanyName": "BGS",
        "gradingTypeName": "Standard",
    }
    black = {
        **standard,
        "id": OTHER_GRADE_ID,
        "gradingTypeId": other_type,
        "gradingTypeName": "Black Label",
    }
    provider["grades_by_type"] = {TYPE_ID: [standard], other_type: [black]}
    response = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert response.status_code == 200, response.text
    options = response.json()["grade_options"]
    assert {option["id"] for option in options} == {GRADE_ID, OTHER_GRADE_ID}
    assert any("Black Label" in option["label"] for option in options)
    assert any("Standard" in option["label"] for option in options)
    failed = client.post(f"/api/cards/{copy['id']}/market-link", json=link_body(copy))
    assert failed.status_code == 422
    link(client, copy, grade_id=OTHER_GRADE_ID)
    current = client.get(f"/api/cards/{copy['id']}/market-link").json()["link"]
    assert current["grade_id"] == OTHER_GRADE_ID


@pytest.mark.parametrize(
    "changes",
    [
        {"releaseName": "Fleer Ultra"},
        {"variationOf": str(uuid4())},
    ],
)
def test_base_mapping_rejects_different_release_and_variation(client, provider, changes):
    access(client)
    copy = card(client)
    provider["cards"] = [catalog(**changes)]
    provider["detail"] = catalog(**changes)
    response = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert response.status_code == 200, response.text
    assert not any(candidate["eligible"] for candidate in response.json()["candidates"])
    assert (
        client.post(f"/api/cards/{copy['id']}/market-link", json=link_body(copy)).status_code == 422
    )
    assert pricing_calls(provider) == []


@pytest.mark.parametrize(
    "section,value,graded",
    [
        ("card", None, False),
        ("card", [], False),
        ("query", None, False),
        ("query", [], False),
        ("raw", [], False),
        ("raw", {"records": None}, False),
        ("raw", {"records": {}}, False),
        ("graded", None, True),
        ("graded", {}, True),
        ("graded", [None], True),
        ("graded", [{"company_name": "PSA", "grades": None}], True),
        ("graded", [{"company_name": "PSA", "grades": [None]}], True),
        (
            "graded",
            [
                {
                    "company_name": "PSA",
                    "grades": [{"grade_id": GRADE_ID, "grade_value": "9", "records": None}],
                }
            ],
            True,
        ),
    ],
)
def test_malformed_provider_sections_are_unavailable_not_server_errors(
    client, provider, section, value, graded
):
    access(client)
    copy = card(
        client, **({"condition": "graded", "grader": "PSA", "grade": "9"} if graded else {})
    )
    provider["pricing"] = pricing(grade_id=GRADE_ID if graded else None)
    provider["pricing"][section] = value
    link(client, copy, grade_id=GRADE_ID if graded else None)
    response = client.get("/api/estimates")
    assert response.status_code == 200, response.text
    result = next(item for item in response.json()["items"] if item["card_id"] == copy["id"])
    assert result["amount"] is None
    assert result["pricing_status"] == "unavailable"
    assert KEY not in response.text


def test_same_grade_distinct_cards_are_batched_without_financial_mutation(client, provider):
    access(client)
    first = card(client, condition="graded", grader="PSA", grade="9")
    second = card(
        client,
        subject="Charles Barkley",
        card_number="7",
        condition="graded",
        grader="PSA",
        grade="9",
        purchase_price="25.50",
    )
    second_id = str(uuid4())
    provider["details"][second_id] = catalog(id=second_id, name="Charles Barkley", number="7")
    provider["pricing_by_card"] = {
        CARD_ID: pricing(grade_id=GRADE_ID),
        second_id: pricing(
            [record(p) for p in ("200", "250", "300")], grade_id=GRADE_ID, card_id=second_id
        ),
    }
    provider["pricing_by_card"][second_id]["card"].update(name="Charles Barkley", number="7")
    link(client, first, grade_id=GRADE_ID)
    link(client, second, card_id=second_id, grade_id=GRADE_ID)
    before = [client.get(f"/api/cards/{copy['id']}").json() for copy in (first, second)]
    values = client.get("/api/estimates")
    assert values.status_code == 200, values.text
    by_id = {item["card_id"]: item for item in values.json()["items"]}
    assert by_id[first["id"]]["amount"] == "100.00"
    assert by_id[second["id"]]["amount"] == "250.00"
    requests = pricing_calls(provider)
    assert len(requests) == 1
    path, params, body = requests[0]
    assert path == "/v1/pricing/" and params is None
    assert set(body["card_ids"]) == {CARD_ID, second_id}
    assert body["parallel_id"] is None and body["grade_id"] == GRADE_ID
    assert body["listing_type"] == "auction" and body["limit"] == 50
    assert [client.get(f"/api/cards/{copy['id']}").json() for copy in (first, second)] == before
    client.get("/api/estimates")
    assert len(pricing_calls(provider)) == 1


def test_reconfirmation_requires_exact_previous_confirmation_timestamp(
    client, provider, monkeypatch
):
    access(client)
    copy = card(client)
    link(client, copy)
    initial = client.get(f"/api/cards/{copy['id']}/market-link").json()["link"]
    monkeypatch.setattr(market_values, "now_utc", lambda: NOW + timedelta(minutes=1))
    monkeypatch.setattr(market_links, "now_utc", lambda: NOW + timedelta(minutes=1))
    response = client.post(
        f"/api/cards/{copy['id']}/market-link",
        json=link_body(
            copy, expected_card_id=CARD_ID, expected_confirmed_at=initial["confirmed_at"]
        ),
    )
    assert response.status_code in (200, 201), response.text
    for stamp in (None, initial["confirmed_at"]):
        stale = client.post(
            f"/api/cards/{copy['id']}/market-link",
            json=link_body(copy, expected_card_id=CARD_ID, expected_confirmed_at=stamp),
        )
        assert stale.status_code == 409, stale.text


def test_catalog_lookup_is_bounded_and_reference_cache_does_not_grow_unlimited(
    client, app, provider
):
    access(client)
    copy = card(client)
    provider["cards"] = [catalog(id=str(uuid4())) for _ in range(25)]
    request = {"expected_definition_id": copy["definition_id"]}
    for _ in range(2):
        response = client.post(f"/api/cards/{copy['id']}/market-link/candidates", json=request)
        assert response.status_code == 200, response.text
        assert len(response.json()["candidates"]) == 20
    catalogs = [call for call in provider["calls"] if call[0] == "/v1/catalog/cards"]
    assert len(catalogs) == 1
    params = catalogs[0][1]
    assert params == {
        "name": "Michael Jordan",
        "min_year": "1986",
        "max_year": "1987",
        "number": "57",
        "take": 20,
        "skip": 0,
    }
    values = app.state.market_values
    for _ in range(market_values.MAX_CACHE_ENTRIES + 5):
        values.document(f"/v1/catalog/cards/{uuid4()}")
    assert len(values.documents) <= market_values.MAX_CACHE_ENTRIES


def test_confirmed_release_matches_sport_and_manufacturer_parents(client, provider):
    access(client)
    copy = card(client, sport="Basketball", manufacturer="Fleer")
    response = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["candidates"][0]["eligible"] is True
    link(client, copy)
    paths = [call[0] for call in provider["calls"]]
    assert f"/v1/catalog/releases/{RELEASE_ID}" in paths
    assert "/v1/catalog/segments" in paths
    assert "/v1/catalog/manufacturers" in paths


@pytest.mark.parametrize(
    "change",
    [
        {"segmentId": str(uuid4())},
        {"manufacturerId": str(uuid4())},
        {"id": str(uuid4())},
        {"year": "1987"},
        {"name": "Fleer Ultra"},
    ],
)
def test_same_card_text_cannot_override_wrong_release_parent(client, provider, change):
    access(client)
    copy = card(client, sport="Basketball", manufacturer="Fleer")
    provider["release"].update(change)
    response = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert response.status_code == 200, response.text
    assert not any(candidate["eligible"] for candidate in response.json()["candidates"])
    failed = client.post(f"/api/cards/{copy['id']}/market-link", json=link_body(copy))
    assert failed.status_code == 422, failed.text
    assert pricing_calls(provider) == []


@pytest.mark.parametrize("available", [True, False])
def test_partial_parallel_must_include_this_card_before_confirmation(client, provider, available):
    access(client)
    copy = card(client, parallel="Gold")
    parallel = {
        "id": PARALLEL_ID,
        "name": "Gold",
        "isPartial": True,
        "cards": [CARD_ID if available else str(uuid4())],
    }
    provider["cards"] = [catalog(parallelCount=1)]
    provider["detail"] = catalog(parallelCount=1, parallels=[parallel])
    response = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["candidates"][0]["eligible"] is available
    confirmed = client.post(f"/api/cards/{copy['id']}/market-link", json=link_body(copy))
    assert confirmed.status_code == (200 if available else 422), confirmed.text


@pytest.mark.parametrize("field", ["parallel_id", "grade_id"])
def test_invalid_uuid_filter_echo_cannot_be_interpreted_as_null_base_raw(client, provider, field):
    access(client)
    copy = card(client)
    provider["pricing"]["query"][field] = "not-a-uuid"
    link(client, copy)
    value = estimate(client, copy)
    assert value["pricing_status"] == "unavailable"
    assert value["amount"] is None


@pytest.mark.parametrize(
    "parallels",
    [
        None,
        {},
        [None],
        [{"id": PARALLEL_ID, "name": "Gold", "isPartial": True, "cards": None}],
    ],
)
def test_malformed_parallel_reference_is_declined_without_server_error(client, provider, parallels):
    access(client)
    copy = card(client, parallel="Gold")
    malformed = catalog(parallelCount=1, parallels=parallels)
    provider["cards"] = [malformed]
    provider["detail"] = malformed
    candidates = client.post(
        f"/api/cards/{copy['id']}/market-link/candidates",
        json={"expected_definition_id": copy["definition_id"]},
    )
    assert candidates.status_code in (200, 422, 502), candidates.text
    if candidates.status_code == 200:
        assert not any(item["eligible"] for item in candidates.json()["candidates"])
    confirmed = client.post(f"/api/cards/{copy['id']}/market-link", json=link_body(copy))
    assert confirmed.status_code in (422, 502), confirmed.text
    assert client.get(f"/api/cards/{copy['id']}/market-link").json()["link"] is None
    assert pricing_calls(provider) == []


def mutate_during_next_price_fetch(app, monkeypatch, action):
    """Simulate another committed request while the first request waits on its provider."""
    fetch = market_values.fetch_json
    changed = False

    def while_waiting(key, path, params=None, body=None):
        nonlocal changed
        result = fetch(key, path, params, body)
        if path.startswith("/v1/pricing/") and not changed:
            changed = True
            with app.state.sessions() as other_db:
                action(other_db)
                other_db.commit()
        return result

    monkeypatch.setattr(market_values, "fetch_json", while_waiting)


@pytest.mark.parametrize("action", ["unlink", "rematch", "grade"])
def test_estimates_recheck_copy_and_binding_after_provider_wait(
    client, app, provider, monkeypatch, action
):
    access(client)
    copy = card(client, condition="graded", grader="PSA", grade="9")
    provider["pricing"] = pricing(grade_id=GRADE_ID)
    link(client, copy, grade_id=GRADE_ID)

    def another_request(db):
        binding = db.get(MarketLink, UUID(copy["id"]))
        if action == "unlink":
            db.delete(binding)
        elif action == "rematch":
            binding.provider_card_id = uuid4()
            binding.confirmed_at = NOW + timedelta(seconds=1)
        else:
            db.get(OwnedCopy, UUID(copy["id"])).grade = "10"

    mutate_during_next_price_fetch(app, monkeypatch, another_request)
    value = estimate(client, copy)
    assert value["amount"] is None
    if action == "unlink":
        assert value["source"] == "saved"
    elif action == "grade":
        assert value["pricing_status"] == "mismatch"
        assert value["grade"] == "10"
    else:
        assert value["pricing_status"] in ("pending", "unavailable")


def test_refresh_returns_conflict_if_card_is_unlinked_during_provider_wait(
    client, app, provider, monkeypatch
):
    access(client)
    copy = card(client)
    link(client, copy)

    def unlink_elsewhere(db):
        db.delete(db.get(MarketLink, UUID(copy["id"])))

    mutate_during_next_price_fetch(app, monkeypatch, unlink_elsewhere)
    refreshed = client.post(f"/api/cards/{copy['id']}/market-link/refresh", json={})
    assert refreshed.status_code == 409, refreshed.text
    assert client.get(f"/api/cards/{copy['id']}/market-link").json()["link"] is None
