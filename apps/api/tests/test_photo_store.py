import json
from email.message import Message
from io import BytesIO
from urllib.error import HTTPError, URLError
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from slabtrak.config import Settings
from slabtrak.photo_store import MAX_PHOTO_BYTES, LocalPhotoStore, SupabasePhotoStore
from slabtrak.photos import photo_path, prepare_photo
from tests.test_photos import image_bytes

SECRET = "sb_secret_isolated_transport_test"


class Response(BytesIO):
    def __init__(self, body=b"", status=200, media_type="image/jpeg"):
        super().__init__(body)
        self.status = status
        self.headers = {"Content-Type": media_type}


def store(monkeypatch, response):
    storage = SupabasePhotoStore("https://example.supabase.co", SECRET, "card-photos")
    calls = []

    def open_request(request, timeout):
        calls.append((request, timeout))
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(storage._opener, "open", open_request)
    return storage, calls


def http_failure(status, detail):
    return HTTPError("https://example.supabase.co/private", status, "upstream", Message(),
                     BytesIO(json.dumps(detail).encode()))


def test_storage_uses_private_paths_api_key_only_and_never_upserts(monkeypatch):
    owner, key = uuid4(), uuid4()
    payload = prepare_photo(image_bytes())
    remote, calls = store(monkeypatch, Response(payload))
    assert remote.read(owner, key) == payload
    request, timeout = calls.pop()
    assert request.full_url.endswith(f"/object/authenticated/card-photos/{owner}/{key}.jpg")
    assert request.get_header("Apikey") == SECRET
    assert request.get_header("Authorization") is None
    assert timeout == 10
    remote, calls = store(monkeypatch, Response())
    remote.write(owner, key, payload)
    request, _ = calls.pop()
    assert request.method == "POST" and request.data == payload
    assert request.full_url.endswith(f"/object/card-photos/{owner}/{key}.jpg")
    assert request.get_header("X-upsert") == "false"
    assert request.get_header("Content-type") == "image/jpeg"
    remote, calls = store(monkeypatch, Response())
    remote.remove(owner, key)
    request, _ = calls.pop()
    assert request.method == "DELETE" and request.full_url.endswith("/object/card-photos")
    assert json.loads(request.data) == {"prefixes": [f"{owner}/{key}.jpg"]}
    remote.remove(owner, None)
    assert not calls


@pytest.mark.parametrize("http_status,detail,expected", [
    (400, {"code": "NoSuchKey"}, 404),
    (400, {"error": "not_found", "message": "Object not found"}, 404),
    (404, {"code": "NoSuchKey"}, 404),
    (404, {"code": "NoSuchBucket", "message": "Bucket not found"}, 503),
    (400, {"statusCode": "403", "error": "not_found"}, 503),
    (401, {"message": SECRET}, 503),
    (403, {"message": SECRET}, 503),
    (429, {"message": SECRET}, 503),
    (500, {"message": SECRET}, 503),
    (302, {}, 503),
    (400, ["unexpected", SECRET], 503),
])
def test_cloud_read_distinguishes_missing_objects_from_config_and_service_failures(
    monkeypatch, http_status, detail, expected
):
    remote, _ = store(monkeypatch, http_failure(http_status, detail))
    with pytest.raises(HTTPException) as failure:
        remote.read(uuid4(), uuid4())
    assert failure.value.status_code == expected
    assert SECRET not in failure.value.detail
    assert "supabase.co" not in failure.value.detail


@pytest.mark.parametrize("response", [
    Response(b"not a JPEG"),
    Response(b"\xff\xd8\xff" + b"x" * MAX_PHOTO_BYTES + b"\xff\xd9"),
    Response(b"<html>upstream error</html>", media_type="text/html"),
    URLError(SECRET),
    TimeoutError(SECRET),
])
def test_corrupt_oversized_and_unavailable_downloads_are_sanitized(monkeypatch, response):
    remote, _ = store(monkeypatch, response)
    with pytest.raises(HTTPException) as failure:
        remote.read(uuid4(), uuid4())
    assert failure.value.status_code == 503
    assert SECRET not in failure.value.detail


def test_upload_conflict_does_not_delete_existing_remote_object(monkeypatch):
    remote, calls = store(monkeypatch, http_failure(409, {"message": SECRET}))
    with pytest.raises(HTTPException) as failure:
        remote.write(uuid4(), uuid4(), prepare_photo(image_bytes()))
    assert failure.value.status_code == 503
    assert len(calls) == 1 and calls[0][0].method == "POST"


def test_cleanup_failure_logs_only_generic_warning(monkeypatch, caplog):
    remote, _ = store(monkeypatch, http_failure(403, {"message": SECRET}))
    remote.remove(uuid4(), uuid4())
    assert "orphan_photo_cleanup_needed" in caplog.text
    assert SECRET not in caplog.text and "supabase.co" not in caplog.text


def test_local_uuid_collision_preserves_existing_image(tmp_path):
    local = LocalPhotoStore(tmp_path)
    owner, key = uuid4(), uuid4()
    first, second = prepare_photo(image_bytes()), prepare_photo(image_bytes("blue"))
    local.write(owner, key, first)
    with pytest.raises(HTTPException):
        local.write(owner, key, second)
    assert photo_path(tmp_path, owner, key).read_bytes() == first


@pytest.mark.parametrize("overrides", [
    {"supabase_url": None},
    {"supabase_secret_key": None},
    {"supabase_secret_key": "sb_publishable_public"},
    {"supabase_secret_key": SECRET + "\nheader: bad"},
    {"supabase_url": "http://example.supabase.co"},
    {"supabase_url": "https://user:password@example.supabase.co"},
    {"supabase_url": "https://example.supabase.co/storage/v1"},
    {"supabase_url": "https://example.supabase.co?destination=elsewhere"},
    {"supabase_storage_bucket": "../other-bucket"},
])
def test_cloud_configuration_rejects_missing_or_unsafe_settings(overrides):
    values = dict(database_url="postgresql+psycopg://unused/unused",
                  photo_storage_backend="supabase", supabase_url="https://example.supabase.co",
                  supabase_secret_key=SECRET)
    values.update(overrides)
    with pytest.raises(ValidationError) as failure:
        Settings(_env_file=None, **values)
    assert SECRET not in str(failure.value)
