"""Evidence imports append owner-scoped sales without modifying collection records."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select

from slabtrak.evidence_import import EvidencePack, import_evidence
from slabtrak.inventory import DEFINITION_FIELDS
from slabtrak.models import Account, CardDefinition, ComparableSale, OwnedCopy
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_inventory import access, add


def sale(number=1, **changes):
    return {
        "sold_on": datetime.now(UTC).date().isoformat(),
        "price": "12.34",
        "source": "Isolated completed-sale fixture",
        "source_url": f"https://example.invalid/completed/{number}",
        **changes,
    }


def entry(card, sales=None, **identity_changes):
    return {
        "identity": {field: card[field] for field in DEFINITION_FIELDS} | identity_changes,
        "research_url": "https://example.invalid/research",
        "sales": [sale()] if sales is None else sales,
    }


def pack(*entries, checked_on=None):
    return EvidencePack.model_validate(
        {
            "checked_on": checked_on or datetime.now(UTC).date().isoformat(),
            "cards": list(entries),
        }
    )


def inventory_state(db):
    # Compare every stored column, including revisions, costs, notes, and photo metadata.
    return {
        model.__tablename__: db.execute(select(model.__table__).order_by(model.id)).all()
        for model in (CardDefinition, OwnedCopy)
    }


def sales_state(db):
    return db.execute(select(ComparableSale.__table__).order_by(ComparableSale.id)).all()


def test_dry_run_apply_and_repeat_preserve_every_collection_field(client, app):
    access(client)
    card = add(
        client,
        year=2024,
        set_name="Fixture set",
        parallel="Silver",
        autograph=True,
        print_run=100,
        serial_number=7,
        purchase_price="8.10",
        shipping="1.20",
        tax="0.30",
        other_cost="0.40",
        seller="Fixture seller",
        notes="These collection details must survive the import.",
    )
    sibling = add(
        client,
        year=2024,
        set_name="Fixture set",
        parallel="Silver",
        autograph=True,
        print_run=100,
        condition="graded",
        grader="BGS",
        grade="9.5",
        certification="fixture-certification",
        centering="9.5",
        corners="9",
        edges="9.5",
        surface="10",
        archived=True,
    )
    sold = add(client, subject="Sold fixture", sold=True, sale_price="20", sale_fees="2")
    # Baseline the persisted response: PostgreSQL normalizes subgrade scale on read.
    cards = [client.get(f"/api/cards/{item['id']}").json() for item in (card, sibling, sold)]
    payload = pack(
        entry(card, [sale(), sale(2, condition="graded", grader="PSA", grade="9")]),
        entry(sold, [sale(3)]),
    )
    expected = [
        {"subject": card["subject"], "added": 2, "skipped": 0},
        {"subject": sold["subject"], "added": 1, "skipped": 0},
    ]
    with app.state.sessions() as db:
        before = inventory_state(db)
        assert import_evidence(db, "collector", payload) == expected
        assert not db.new and not db.dirty and not db.deleted
        db.commit()
        assert sales_state(db) == []
        assert inventory_state(db) == before
        assert import_evidence(db, "collector", payload, apply=True) == expected
        db.commit()
        saved_sales = sales_state(db)
        assert len(saved_sales) == 3
        assert inventory_state(db) == before
        repeated = [dict(item, added=0, skipped=item["added"]) for item in expected]
        assert import_evidence(db, "collector", payload, apply=True) == repeated
        db.commit()
        assert sales_state(db) == saved_sales
        assert inventory_state(db) == before
    for unchanged in cards:
        assert client.get(f"/api/cards/{unchanged['id']}").json() == unchanged


def test_apply_leaves_transaction_control_to_the_caller(client, app):
    access(client)
    card = add(client)
    with app.state.sessions() as db:
        import_evidence(db, "collector", pack(entry(card)), apply=True)
        db.flush()
        assert len(sales_state(db)) == 1
        db.rollback()
    with app.state.sessions() as db:
        assert sales_state(db) == []


def test_historical_import_requires_opt_in_and_never_changes_current_window_or_card(client, app):
    access(client)
    card = add(client)
    old_date = (datetime.now(UTC).date() - timedelta(days=730)).isoformat()
    incoming = pack(
        entry(
            card,
            [
                sale(1, sold_on=old_date, price="999.99"),
                sale(2, price="10.01"),
                sale(3, price="20.02"),
                sale(4, price="30.03"),
            ],
        )
    )
    with app.state.sessions() as db:
        before = inventory_state(db)
        with pytest.raises(ValueError, match="180 days"):
            import_evidence(db, "collector", incoming, apply=True)
        assert sales_state(db) == []
        result = import_evidence(db, "collector", incoming, apply=True, include_history=True)
        assert result[0]["added"] == 4
        db.commit()
        assert inventory_state(db) == before
        repeated = import_evidence(db, "collector", incoming, apply=True, include_history=True)
        assert repeated[0]["added"] == 0 and repeated[0]["skipped"] == 4
        db.commit()
    estimate = client.get(f"/api/cards/{card['id']}/comparables").json()["estimate"]
    assert estimate["amount"] == "20.02" and estimate["sample_count"] == 3
    assert len(estimate["history"]) == 4
    assert estimate["history"][0] == {"sold_on": old_date, "price": "999.99"}


def test_historical_opt_in_does_not_allow_sales_after_research_date(client, app):
    access(client)
    card = add(client)
    checked = datetime.now(UTC).date() - timedelta(days=731)
    incoming = pack(
        entry(card, [sale(sold_on=(checked + timedelta(days=1)).isoformat())]), checked_on=checked
    )
    with app.state.sessions() as db:
        with pytest.raises(ValueError, match="check date"):
            import_evidence(db, "collector", incoming, apply=True, include_history=True)
        assert sales_state(db) == []


def test_repeated_sale_inside_the_same_pack_is_counted_once(client, app):
    access(client)
    card = add(client)
    incoming = pack(entry(card, [sale(), sale()]))
    with app.state.sessions() as db:
        assert import_evidence(db, "collector", incoming, apply=True) == [
            {"subject": card["subject"], "added": 1, "skipped": 1}
        ]
        db.commit()
        assert len(sales_state(db)) == 1
        assert import_evidence(db, "collector", incoming, apply=True) == [
            {"subject": card["subject"], "added": 0, "skipped": 2}
        ]
        db.commit()
        assert len(sales_state(db)) == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"subject": "Another subject"},
        {"year": 2024},
        {"sport": "Baseball"},
        {"manufacturer": "Fixture maker"},
        {"set_name": "Another set"},
        {"card_number": "2"},
        {"parallel": "Blue"},
        {"autograph": True},
        {"memorabilia": True},
        {"print_run": 10},
    ],
)
def test_every_identity_component_must_match_an_existing_copy(client, app, changes):
    access(client)
    card = add(client)
    with app.state.sessions() as db:
        before = inventory_state(db)
        with pytest.raises(ValueError):
            import_evidence(db, "collector", pack(entry(card, **changes)), apply=True)
        assert not db.new and not db.dirty and not db.deleted
        db.commit()
        assert inventory_state(db) == before
        assert sales_state(db) == []


def test_an_orphaned_definition_does_not_authorize_import(client, app):
    access(client)
    card = add(client)
    assert client.delete(f"/api/cards/{card['id']}?revision=1").status_code == 204
    with app.state.sessions() as db:
        assert db.scalar(select(CardDefinition)) is not None
        assert db.scalar(select(OwnedCopy)) is None
        before = inventory_state(db)
        with pytest.raises(ValueError):
            import_evidence(db, "collector", pack(entry(card)), apply=True)
        db.commit()
        assert inventory_state(db) == before
        assert sales_state(db) == []


def test_owner_isolation_and_owner_scoped_source_urls(client, app):
    access(client)
    card = add(client)
    with app.state.sessions() as db:
        db.add(
            Account(
                username="other",
                password_hash=password_hasher.hash(PASSWORD),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
        before = inventory_state(db)
        for username in ("other", "missing-owner"):
            with pytest.raises(ValueError):
                import_evidence(db, username, pack(entry(card)), apply=True)
        db.commit()
        assert inventory_state(db) == before
        assert sales_state(db) == []
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
        access(other, "other")
        own = add(other)
    assert own["definition_id"] != card["definition_id"]
    with app.state.sessions() as db:
        import_evidence(db, "collector", pack(entry(card)), apply=True)
        import_evidence(db, "other", pack(entry(own)), apply=True)
        db.commit()
        records = list(db.scalars(select(ComparableSale)))
        assert len(records) == 2
        assert len({record.owner_id for record in records}) == 2
        assert len({record.source_url for record in records}) == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"price": "99.99"},
        {"currency": "CAD"},
        {"sold_on": (datetime.now(UTC).date() - timedelta(days=1)).isoformat()},
        {"source": "Changed source description"},
        {"condition": "graded", "grader": "PSA", "grade": "9"},
    ],
)
def test_existing_source_with_changed_facts_is_rejected_before_new_sales(client, app, changes):
    access(client)
    card = add(client)
    with app.state.sessions() as db:
        import_evidence(db, "collector", pack(entry(card)), apply=True)
        db.commit()
        before = sales_state(db)
        incoming = pack(entry(card, [sale(2), sale(**changes)]))
        with pytest.raises(ValueError):
            import_evidence(db, "collector", incoming, apply=True)
        assert not db.new
        db.commit()
        assert sales_state(db) == before


def test_existing_source_cannot_be_reassigned_to_another_identity(client, app):
    access(client)
    first = add(client)
    second = add(client, subject="Other identity")
    with app.state.sessions() as db:
        import_evidence(db, "collector", pack(entry(first)), apply=True)
        db.commit()
        before = sales_state(db)
        with pytest.raises(ValueError):
            import_evidence(db, "collector", pack(entry(second)), apply=True)
        db.commit()
        assert sales_state(db) == before


def test_later_identity_failure_does_not_leave_earlier_card_sales_pending(client, app):
    access(client)
    first = add(client)
    second = add(client, subject="Second fixture")
    incoming = pack(entry(first), entry(second, [sale(2)], parallel="Missing variant"))
    with app.state.sessions() as db:
        before = inventory_state(db)
        with pytest.raises(ValueError):
            import_evidence(db, "collector", incoming, apply=True)
        assert not db.new
        db.commit()
        assert sales_state(db) == []
        assert inventory_state(db) == before


@pytest.mark.parametrize("other_identity", [False, True])
def test_conflicting_sources_inside_pack_are_atomic(client, app, other_identity):
    access(client)
    first = add(client)
    second = add(client, subject="Other fixture") if other_identity else first
    incoming = pack(entry(first), entry(second, [sale(price="99")]))
    with app.state.sessions() as db:
        before = inventory_state(db)
        with pytest.raises(ValueError):
            import_evidence(db, "collector", incoming, apply=True)
        assert not db.new
        db.commit()
        assert sales_state(db) == []
        assert inventory_state(db) == before


def test_identity_defaults_and_oldest_supported_sale_are_accepted(client, app):
    access(client)
    card = add(client)
    oldest = (datetime.now(UTC).date() - timedelta(days=179)).isoformat()
    incoming = EvidencePack.model_validate(
        {
            "checked_on": oldest,
            "cards": [
                {
                    **entry(card, [sale(sold_on=oldest)]),
                    "identity": {"subject": card["subject"]},
                }
            ],
        }
    )
    with app.state.sessions() as db:
        assert import_evidence(db, "collector", incoming, apply=True) == [
            {"subject": card["subject"], "added": 1, "skipped": 0}
        ]
        db.commit()
        assert db.scalar(select(ComparableSale)).sold_on.isoformat() == oldest


@pytest.mark.parametrize(
    "mutation",
    [
        "future_check",
        "sale_after_check",
        "expired_sale",
        "missing_source",
        "missing_source_url",
        "blank_source_url",
        "unsafe_research_url",
        "copy_field_in_identity",
        "unknown_identity_field",
    ],
)
def test_invalid_pack_cannot_write_collection_or_evidence(client, app, mutation):
    access(client)
    card = add(client)
    today = datetime.now(UTC).date()
    data = {"checked_on": today.isoformat(), "cards": [entry(card)]}
    current = data["cards"][0]
    if mutation == "future_check":
        data["checked_on"] = (today + timedelta(days=1)).isoformat()
    elif mutation == "sale_after_check":
        data["checked_on"] = (today - timedelta(days=1)).isoformat()
    elif mutation == "expired_sale":
        current["sales"][0]["sold_on"] = (today - timedelta(days=180)).isoformat()
    elif mutation == "missing_source":
        current["sales"][0].pop("source")
    elif mutation == "missing_source_url":
        current["sales"][0].pop("source_url")
    elif mutation == "blank_source_url":
        current["sales"][0]["source_url"] = " "
    elif mutation == "unsafe_research_url":
        current["research_url"] = "http://example.invalid/research"
    elif mutation == "copy_field_in_identity":
        current["identity"]["notes"] = "Not identity data"
    elif mutation == "unknown_identity_field":
        current["identity"]["owner_id"] = card["id"]
    with app.state.sessions() as db:
        before = inventory_state(db)
        with pytest.raises((ValidationError, ValueError)):
            incoming = EvidencePack.model_validate(data)
            import_evidence(db, "collector", incoming, apply=True)
        db.commit()
        assert inventory_state(db) == before
        assert sales_state(db) == []
