from datetime import UTC, datetime
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from slabtrak.app import COOKIE, create_app
from slabtrak.config import Settings
from slabtrak.models import Account, OwnedCopy
from slabtrak.photos import MAX_UPLOAD, photo_path
from slabtrak.security import password_hasher
from tests.conftest import ORIGIN, PASSWORD
from tests.test_inventory import access, add, edit


def image_bytes(color="green", size=(100, 150)):
    buffer = BytesIO()
    image = Image.new("RGB", size, color)
    exif = Image.Exif()
    exif[271] = "Private camera metadata"
    image.save(buffer, "JPEG", exif=exif)
    return buffer.getvalue()


def upload(client, card, payload=None, side=None):
    query = f"revision={card['revision']}" + (f"&side={side}" if side is not None else "")
    return client.put(
        f"/api/cards/{card['id']}/photo?{query}",
        content=payload if payload is not None else image_bytes(),
        headers={"Content-Type": "application/octet-stream"},
    )


@pytest.mark.parametrize("side", ["front", "back"])
def test_photo_is_private_processed_and_persists_across_api_instances(client, app, tmp_path, side):
    access(client)
    card = add(client)
    prefix = "back_" if side == "back" else ""
    assert card[f"{prefix}photo_url"] is None
    result = upload(client, card, side=side)
    assert result.status_code == 200
    saved = result.json()
    assert saved["revision"] == 2
    assert saved[f"{prefix}photo_kind"] == "upload"
    url = saved[f"{prefix}photo_url"]
    assert ("side=back" in url) == (side == "back")
    image = client.get(url)
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.headers["cache-control"] == "no-store"
    with Image.open(BytesIO(image.content)) as decoded:
        assert decoded.size == (100, 150)
        assert not decoded.getexif()
    settings = Settings(
        database_url=app.state.engine.url.render_as_string(hide_password=False),
        app_origin=ORIGIN,
        photo_root=tmp_path / "photos",
    )
    with TestClient(create_app(settings), base_url=ORIGIN) as restarted:
        assert restarted.get(url).status_code == 401
        assert upload(restarted, saved, side=side).status_code == 401
        removal = restarted.delete(
            f"/api/cards/{card['id']}/photo?revision={saved['revision']}&side={side}"
        )
        assert removal.status_code == 401
        restarted.cookies.set(COOKIE, client.cookies[COOKIE])
        assert restarted.get(url).content == image.content
    assert client.get("/api/cards").json()["items"][0][f"{prefix}photo_url"] == url


def test_replacement_remove_and_copy_deletion_clean_up_files(client, app, tmp_path):
    access(client)
    card = add(client)
    first = upload(client, card).json()
    with app.state.sessions() as db:
        copy = db.scalar(select(OwnedCopy))
        old = photo_path(tmp_path / "photos", copy.owner_id, copy.photo_key)
    second = upload(client, first, image_bytes("blue")).json()
    assert not old.exists()
    assert second["photo_url"] != first["photo_url"]
    assert len(list((tmp_path / "photos").rglob("*.jpg"))) == 1
    assert upload(client, first).status_code == 409
    assert client.delete(f"/api/cards/{card['id']}/photo?revision=2").status_code == 409
    removed = client.delete(f"/api/cards/{card['id']}/photo?revision=3").json()
    assert removed["photo_url"] is None
    assert not list((tmp_path / "photos").rglob("*.jpg"))
    assert client.get(first["photo_url"]).status_code == 404
    last = upload(client, removed).json()
    assert client.delete(f"/api/cards/{card['id']}?revision={last['revision']}").status_code == 204
    assert not list((tmp_path / "photos").rglob("*.jpg"))


@pytest.mark.parametrize("side", ["front", "back"])
def test_other_account_cannot_view_replace_or_remove_photo(client, app, side):
    access(client)
    card = upload(client, add(client), side=side).json()
    url = card["back_photo_url" if side == "back" else "photo_url"]
    with app.state.sessions() as db:
        db.add(
            Account(
                username="other-collector",
                password_hash=password_hasher.hash(PASSWORD),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as other:
        access(other, "other-collector")
        assert other.get(url).status_code == 404
        assert upload(other, card, side=side).status_code == 404
        deleted = other.delete(f"/api/cards/{card['id']}/photo?revision=2&side={side}")
        assert deleted.status_code == 404
    assert client.get(url).status_code == 200


@pytest.mark.parametrize("side", ["front", "back"])
def test_invalid_and_oversized_images_do_not_change_card(client, tmp_path, side):
    access(client)
    card = add(client)
    for data in (
        b"not an image",
        b'<svg xmlns="http://www.w3.org/2000/svg"/>',
        image_bytes(size=(16, 16)),
        image_bytes(size=(5000, 4000)),
        image_bytes()[:30],
    ):
        assert upload(client, card, data, side=side).status_code == 422
    assert upload(client, card, b"x" * (MAX_UPLOAD + 1), side=side).status_code == 413
    saved = client.get(f"/api/cards/{card['id']}").json()
    assert saved["revision"] == 1
    assert saved["photo_url"] is None and saved["back_photo_url"] is None
    assert not list((tmp_path / "photos").rglob("*.jpg"))


@pytest.mark.parametrize("side", ["front", "back"])
def test_photo_writes_require_csrf_and_trusted_origin(client, side):
    access(client)
    card = add(client)
    token = client.headers.pop("x-csrf-token")
    assert upload(client, card, side=side).status_code == 403
    assert client.delete(f"/api/cards/{card['id']}/photo?revision=1&side={side}").status_code == 403
    client.headers["X-CSRF-Token"] = token
    client.headers["Origin"] = "https://untrusted.example"
    assert upload(client, card, side=side).status_code == 403


def test_failed_database_commit_does_not_leave_a_photo(client, app, monkeypatch, tmp_path):
    access(client)
    card = add(client)

    def fail_commit(self):
        raise OperationalError("test commit failure", {}, Exception("isolated test"))

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", fail_commit)
        assert upload(client, card).status_code == 503
    assert not list((tmp_path / "photos").rglob("*.jpg"))
    with app.state.sessions() as db:
        assert db.scalar(select(OwnedCopy)).photo_key is None


def test_card_metadata_edits_preserve_photo_and_resize_large_images(client):
    access(client)
    card = upload(client, add(client), image_bytes(size=(1800, 2400))).json()
    with Image.open(BytesIO(client.get(card["photo_url"]).content)) as image:
        assert image.size == (900, 1200)
    changed = client.put(f"/api/cards/{card['id']}", json=edit(card, notes="Keep the photo"))
    assert changed.status_code == 200
    assert changed.json()["photo_url"] == card["photo_url"]
    assert client.get(card["photo_url"]).status_code == 200


@pytest.mark.parametrize("side,other_side", [("front", "back"), ("back", "front")])
def test_sides_replace_and_remove_independently_with_shared_revision(
    client, app, tmp_path, side, other_side
):
    access(client)
    card = upload(client, add(client), side=other_side).json()
    prefix = "back_" if side == "back" else ""
    other_prefix = "back_" if other_side == "back" else ""
    # Existing reference metadata on the opposite side must survive every write.
    with app.state.sessions() as db:
        copy = db.scalar(select(OwnedCopy))
        setattr(copy, f"{other_prefix}photo_kind", "reference")
        setattr(copy, f"{other_prefix}photo_source", "https://example.com/reference")
        db.commit()
    card = client.get(f"/api/cards/{card['id']}").json()
    other_url = card[f"{other_prefix}photo_url"]
    other_bytes = client.get(other_url).content
    first = upload(client, card, side=side).json()
    first_url = first[f"{prefix}photo_url"]
    first_bytes = client.get(first_url).content
    replaced = upload(client, first, image_bytes("blue"), side=side).json()
    assert replaced[f"{prefix}photo_url"] != first_url
    assert client.get(replaced[f"{prefix}photo_url"]).content != first_bytes
    assert upload(client, first, side=other_side).status_code == 409
    stale_remove = f"/api/cards/{card['id']}/photo?revision={first['revision']}&side={other_side}"
    assert client.delete(stale_remove).status_code == 409
    assert len(list((tmp_path / "photos").rglob("*.jpg"))) == 2
    removed = client.delete(
        f"/api/cards/{card['id']}/photo?revision={replaced['revision']}&side={side}"
    ).json()
    assert removed[f"{prefix}photo_url"] is None
    assert removed[f"{prefix}photo_kind"] == "upload"
    assert removed[f"{prefix}photo_source"] == ""
    assert removed[f"{other_prefix}photo_url"] == other_url
    assert removed[f"{other_prefix}photo_kind"] == "reference"
    assert removed[f"{other_prefix}photo_source"] == "https://example.com/reference"
    assert client.get(other_url).content == other_bytes
    assert len(list((tmp_path / "photos").rglob("*.jpg"))) == 1


@pytest.mark.parametrize("side", ["front", "back"])
def test_failed_replacement_and_removal_preserve_both_photos(
    client, app, monkeypatch, tmp_path, side
):
    access(client)
    card = upload(client, add(client)).json()
    card = upload(client, card, image_bytes("blue"), side="back").json()
    before = {url: client.get(url).content for url in (card["photo_url"], card["back_photo_url"])}

    def fail_commit(self):
        raise OperationalError("test commit failure", {}, Exception("isolated test"))

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", fail_commit)
        assert upload(client, card, image_bytes("red"), side=side).status_code == 503
        removed = client.delete(
            f"/api/cards/{card['id']}/photo?revision={card['revision']}&side={side}"
        )
        assert removed.status_code == 503
    assert client.get(f"/api/cards/{card['id']}").json() == card
    assert len(list((tmp_path / "photos").rglob("*.jpg"))) == 2
    for url, payload in before.items():
        assert client.get(url).content == payload


def test_copy_deletion_cleans_both_photos_and_metadata_edits_preserve_them(client, tmp_path):
    access(client)
    card = upload(client, add(client)).json()
    card = upload(client, card, image_bytes("blue"), side="back").json()
    changed = client.put(f"/api/cards/{card['id']}", json=edit(card, notes="Both sides retained"))
    assert changed.status_code == 200
    card = changed.json()
    for field in ("photo_url", "back_photo_url"):
        assert client.get(card[field]).status_code == 200
    assert len(list((tmp_path / "photos").rglob("*.jpg"))) == 2
    assert client.delete(f"/api/cards/{card['id']}?revision={card['revision']}").status_code == 204
    assert not list((tmp_path / "photos").rglob("*.jpg"))
    for field in ("photo_url", "back_photo_url"):
        assert client.get(card[field]).status_code == 404


def test_unknown_side_is_rejected_without_mutating_card(client, tmp_path):
    access(client)
    card = upload(client, add(client)).json()
    url = f"/api/cards/{card['id']}/photo?revision={card['revision']}&side=sideways"
    assert client.get(url).status_code == 422
    assert upload(client, card, side="sideways").status_code == 422
    assert client.delete(url).status_code == 422
    assert client.get(f"/api/cards/{card['id']}").json() == card
    assert len(list((tmp_path / "photos").rglob("*.jpg"))) == 1
