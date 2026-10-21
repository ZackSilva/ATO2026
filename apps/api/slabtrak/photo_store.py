"""Private photo storage; callers authorize ownership before using either backend."""

import json
import logging
from http.client import HTTPException as HTTPProtocolError
from pathlib import Path
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID

from fastapi import HTTPException

from slabtrak.photos import photo_path, remove_photo, write_photo

MAX_PHOTO_BYTES = 1024 * 1024
STORAGE_TIMEOUT = 10
UNAVAILABLE = "Photo storage is temporarily unavailable. Please retry."
MISSING = "Photo is unavailable. Upload it again."
logger = logging.getLogger("slabtrak")


class PhotoStore(Protocol):
    def read(self, owner_id: UUID, key: UUID) -> bytes: ...

    def write(self, owner_id: UUID, key: UUID, payload: bytes) -> None: ...

    def remove(self, owner_id: UUID, key: UUID | None) -> None: ...


def _validate_photo(payload: bytes) -> bytes:
    # Uploads already decode and strip metadata; check stored size and basic JPEG framing.
    if (
        len(payload) > MAX_PHOTO_BYTES
        or not payload.startswith(b"\xff\xd8\xff")
        or not payload.endswith(b"\xff\xd9")
    ):
        raise HTTPException(503, UNAVAILABLE)
    return payload


class LocalPhotoStore:
    def __init__(self, root: Path):
        self.root = root

    def read(self, owner_id: UUID, key: UUID) -> bytes:
        try:
            with photo_path(self.root, owner_id, key).open("rb") as photo:
                return _validate_photo(photo.read(MAX_PHOTO_BYTES + 1))
        except FileNotFoundError:
            raise HTTPException(404, MISSING) from None
        except OSError:
            raise HTTPException(503, UNAVAILABLE) from None

    def write(self, owner_id: UUID, key: UUID, payload: bytes) -> None:
        write_photo(self.root, owner_id, key, payload)

    def remove(self, owner_id: UUID, key: UUID | None) -> None:
        remove_photo(self.root, owner_id, key)


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # A storage redirect must never forward the backend's secret to another origin.
        return None


class SupabasePhotoStore:
    """Use a server-only key and private REST objects; never generate browser storage URLs."""

    def __init__(self, url: str, secret_key: str, bucket: str):
        # Settings validates the fixed HTTPS project URL and bucket before construction.
        self._base_url = f"{url.rstrip('/')}/storage/v1/object"
        self._secret_key = secret_key
        self._bucket = bucket
        self._opener = build_opener(_NoRedirect())

    @staticmethod
    def _object_path(owner_id: UUID, key: UUID) -> str:
        return f"{owner_id}/{key}.jpg"

    @staticmethod
    def _is_missing(error: HTTPError) -> bool:
        if error.code not in (400, 404):
            return False
        try:
            raw = error.read(8193)
            detail = json.loads(raw) if len(raw) <= 8192 else {}
        except (ValueError, OSError, HTTPProtocolError, RecursionError):
            detail = {}
        if not isinstance(detail, dict):
            detail = {}
        codes = {
            str(detail.get(field, "")).lower().replace("_", "")
            for field in ("code", "error")
        }
        message = str(detail.get("message", "")).lower()
        if str(detail.get("statusCode", "")) in {"401", "403"}:
            return False
        # A missing bucket is a configuration fault, even when Supabase returns HTTP 404.
        if codes & {"nosuchbucket", "bucketnotfound"} or "bucket" in message:
            return False
        return error.code == 404 or bool(codes & {"nosuchkey", "notfound", "objectnotfound"})

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: bytes | None = None,
        content_type: str | None = None,
        read_photo: bool = False,
    ) -> bytes:
        # New sb_secret keys belong in apikey only, not in a Bearer JWT header.
        headers = {"apikey": self._secret_key}
        if content_type:
            headers["Content-Type"] = content_type
        if method == "POST":
            headers["x-upsert"] = "false"
        request = Request(f"{self._base_url}/{path}", data=payload, headers=headers, method=method)
        try:
            with self._opener.open(request, timeout=STORAGE_TIMEOUT) as response:
                if not 200 <= response.status < 300:
                    raise HTTPException(503, UNAVAILABLE)
                if not read_photo:
                    return b""
                media_type = response.headers.get("Content-Type", "").split(";", 1)[0].lower()
                if media_type != "image/jpeg":
                    raise HTTPException(503, UNAVAILABLE)
                return _validate_photo(response.read(MAX_PHOTO_BYTES + 1))
        except HTTPError as error:
            try:
                missing = read_photo and self._is_missing(error)
            finally:
                error.close()
            raise HTTPException(
                404 if missing else 503, MISSING if missing else UNAVAILABLE
            ) from None
        except (URLError, OSError, ValueError, HTTPProtocolError):
            # Never include upstream bodies, URLs, or credentials in client errors or logs.
            raise HTTPException(503, UNAVAILABLE) from None

    def read(self, owner_id: UUID, key: UUID) -> bytes:
        path = f"authenticated/{self._bucket}/{self._object_path(owner_id, key)}"
        return self._request("GET", path, read_photo=True)

    def write(self, owner_id: UUID, key: UUID, payload: bytes) -> None:
        self._request(
            "POST",
            f"{self._bucket}/{self._object_path(owner_id, key)}",
            payload=payload,
            content_type="image/jpeg",
        )

    def remove(self, owner_id: UUID, key: UUID | None) -> None:
        if key is None:
            return
        try:
            self._request(
                "DELETE",
                self._bucket,
                payload=json.dumps({"prefixes": [self._object_path(owner_id, key)]}).encode(),
                content_type="application/json",
            )
        except HTTPException:
            # Cleanup follows a successful database commit, so it must not turn a save into failure.
            logger.warning("orphan_photo_cleanup_needed")
