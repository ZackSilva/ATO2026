"""Route integration with shared in-memory cloud storage; transport is tested separately."""

import logging
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from slabtrak.app import COOKIE, create_app
from slabtrak.config import Settings
from slabtrak.models import Account
from slabtrak.photo_store import MISSING, UNAVAILABLE
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_inventory import access, add
from tests.test_photos import image_bytes, upload


class MemoryPhotoStore:
    """A shared cloud backing store with injectable failures and observable calls."""

    def __init__(self, objects, calls):
        self.objects = objects
        self.calls = calls
        self.read_failure = False
        self.write_failure = False
        self.cleanup_failure = False

    def read(self, owner_id, key):
        self.calls.append(("read", owner_id, key))
        if self.read_failure:
            raise HTTPException(503, UNAVAILABLE)
        if (owner_id, key) not in self.objects:
            raise HTTPException(404, MISSING)
        return self.objects[owner_id, key]

    def write(self, owner_id, key, payload):
        self.calls.append(("write", owner_id, key))
        if self.write_failure:
            raise HTTPException(503, UNAVAILABLE)
        assert (owner_id, key) not in self.objects
        self.objects[owner_id, key] = payload

    def remove(self, owner_id, key):
        if key is None:
            return
        self.calls.append(("remove", owner_id, key))
        if self.cleanup_failure:
            # Match the adapter's best-effort cleanup contract after database commits.
            logging.getLogger("slabtrak").warning("orphan_photo_cleanup_needed")
            return
        self.objects.pop((owner_id, key), None)


@pytest.fixture
def cloud_settings(app, tmp_path):
    return Settings(
        _env_file=None,
        database_url=app.state.engine.url.render_as_string(hide_password=False),
        app_origin=ORIGIN,
        photo_root=tmp_path / "unused-local-photos",
        photo_storage_backend="supabase",
        supabase_url="https://example.supabase.co",
        supabase_secret_key="sb_secret_test_only",
    )


@pytest.fixture
def cloud_app(cloud_settings, monkeypatch):
    objects, calls = {}, []
    monkeypatch.setattr(
        "slabtrak.app.SupabasePhotoStore", lambda *_: MemoryPhotoStore(objects, calls)
    )

    def forbid_local_store(*_):
        pytest.fail("Cloud storage must never fall back to the local filesystem.")

    monkeypatch.setattr("slabtrak.app.LocalPhotoStore", forbid_local_store)
    application = create_app(cloud_settings)
    yield application
    application.state.engine.dispose()
    assert not cloud_settings.photo_root.exists()


@pytest.fixture
def cloud_client(cloud_app):
    with TestClient(cloud_app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as client:
        yield client


def both_photos(client):
    card = upload(client, add(client)).json()
    return upload(client, card, image_bytes("blue"), side="back").json()


def test_cloud_front_and_back_survive_a_new_api_instance(cloud_client, cloud_app, cloud_settings):
    access(cloud_client)
    card = both_photos(cloud_client)
    before = {
        field: cloud_client.get(card[field]).content for field in ("photo_url", "back_photo_url")
    }
    assert len(cloud_app.state.photo_store.objects) == 2
    restarted_app = create_app(cloud_settings)
    assert restarted_app.state.photo_store is not cloud_app.state.photo_store
    with TestClient(restarted_app, base_url=ORIGIN) as restarted:
        assert restarted.get(card["photo_url"]).status_code == 401
        restarted.cookies.set(COOKIE, cloud_client.cookies[COOKIE])
        for field, payload in before.items():
            result = restarted.get(card[field])
            assert result.status_code == 200
            assert result.content == payload
            assert result.headers["cache-control"] == "no-store"
            assert result.headers["content-type"] == "image/jpeg"
    assert before["photo_url"] != before["back_photo_url"]


@pytest.mark.parametrize("side", ["front", "back"])
def test_cloud_owner_checks_precede_storage_access(cloud_client, cloud_app, side):
    access(cloud_client)
    card = both_photos(cloud_client)
    with cloud_app.state.sessions() as db:
        db.add(
            Account(
                username="other-collector",
                password_hash=password_hasher.hash(PASSWORD),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
    store = cloud_app.state.photo_store
    store.calls.clear()
    with TestClient(cloud_app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
        access(other, "other-collector")
        field = "back_photo_url" if side == "back" else "photo_url"
        assert other.get(card[field]).status_code == 404
        assert upload(other, card, side=side).status_code == 404
        assert other.delete(
            f"/api/cards/{card['id']}/photo?revision={card['revision']}&side={side}"
        ).status_code == 404
        assert other.delete(
            f"/api/cards/{card['id']}?revision={card['revision']}"
        ).status_code == 404
    assert store.calls == []
    assert len(store.objects) == 2


def test_cloud_csrf_origin_and_revision_checks_precede_storage(cloud_client, cloud_app):
    access(cloud_client)
    card = both_photos(cloud_client)
    store = cloud_app.state.photo_store
    store.calls.clear()
    token = cloud_client.headers.pop("x-csrf-token")
    assert upload(cloud_client, card).status_code == 403
    assert cloud_client.delete(
        f"/api/cards/{card['id']}/photo?revision={card['revision']}"
    ).status_code == 403
    cloud_client.headers["X-CSRF-Token"] = token
    cloud_client.headers["Origin"] = "https://untrusted.example"
    assert upload(cloud_client, card, side="back").status_code == 403
    cloud_client.headers["Origin"] = ORIGIN
    stale = card | {"revision": card["revision"] - 1}
    assert upload(cloud_client, stale).status_code == 409
    assert cloud_client.delete(
        f"/api/cards/{card['id']}/photo?revision={stale['revision']}&side=back"
    ).status_code == 409
    assert store.calls == []
    assert len(store.objects) == 2


@pytest.mark.parametrize("side", ["front", "back"])
def test_cloud_database_failure_removes_new_object_and_keeps_both_sides(
    cloud_client, cloud_app, monkeypatch, side
):
    access(cloud_client)
    card = both_photos(cloud_client)
    store = cloud_app.state.photo_store
    before = dict(store.objects)
    store.calls.clear()

    def fail_commit(self):
        raise OperationalError("test commit failure", {}, Exception("isolated test"))

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", fail_commit)
        assert upload(cloud_client, card, image_bytes("red"), side=side).status_code == 503
        assert cloud_client.delete(
            f"/api/cards/{card['id']}/photo?revision={card['revision']}&side={side}"
        ).status_code == 503
    assert store.objects == before
    assert [call[0] for call in store.calls] == ["write", "remove"]
    assert store.calls[0][1:] == store.calls[1][1:]
    assert cloud_client.get(f"/api/cards/{card['id']}").json() == card


def test_cloud_upload_failure_preserves_existing_photos_and_card(cloud_client, cloud_app):
    access(cloud_client)
    card = both_photos(cloud_client)
    store = cloud_app.state.photo_store
    before = dict(store.objects)
    store.calls.clear()
    store.write_failure = True
    result = upload(cloud_client, card, image_bytes("red"))
    assert result.status_code == 503
    assert result.json() == {"detail": UNAVAILABLE}
    assert store.objects == before
    assert [call[0] for call in store.calls] == ["write"]
    assert cloud_client.get(f"/api/cards/{card['id']}").json() == card


def test_cloud_cleanup_failure_keeps_card_deletion_successful(cloud_client, cloud_app, caplog):
    access(cloud_client)
    card = both_photos(cloud_client)
    store = cloud_app.state.photo_store
    store.cleanup_failure = True
    with caplog.at_level(logging.WARNING, logger="slabtrak"):
        result = cloud_client.delete(f"/api/cards/{card['id']}?revision={card['revision']}")
    assert result.status_code == 204
    assert cloud_client.get(f"/api/cards/{card['id']}").status_code == 404
    assert len(store.objects) == 2
    messages = [record.getMessage() for record in caplog.records if record.name == "slabtrak"]
    assert messages == ["orphan_photo_cleanup_needed", "orphan_photo_cleanup_needed"]
    assert "sb_secret_test_only" not in caplog.text
    assert "example.supabase.co" not in caplog.text


def test_cloud_storage_status_requires_login_and_exposes_only_backend(cloud_client, cloud_app):
    assert cloud_client.get("/api/storage/status").status_code == 401
    access(cloud_client)
    result = cloud_client.get("/api/storage/status")
    assert result.status_code == 200
    assert result.json() == {"photos": "supabase"}
    assert result.headers["cache-control"] == "no-store"
    assert cloud_app.state.photo_store.calls == []


def test_cloud_missing_and_unavailable_reads_preserve_card_metadata(cloud_client, cloud_app):
    access(cloud_client)
    card = both_photos(cloud_client)
    store = cloud_app.state.photo_store
    store.read_failure = True
    unavailable = cloud_client.get(card["photo_url"])
    assert unavailable.status_code == 503
    assert unavailable.json() == {"detail": UNAVAILABLE}
    store.read_failure = False
    store.objects.clear()
    for field in ("photo_url", "back_photo_url"):
        missing = cloud_client.get(card[field])
        assert missing.status_code == 404
        assert missing.json() == {"detail": MISSING}
    assert cloud_client.get(f"/api/cards/{card['id']}").json() == card
