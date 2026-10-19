"""Bounded, metadata-free previews stored outside the web server's public directory."""

import logging
import os
from io import BytesIO
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD = 4 * 1024 * 1024
MAX_PIXELS = 16_000_000
logger = logging.getLogger("slabtrak")


def prepare_photo(payload: bytes) -> bytes:
    if len(payload) > MAX_UPLOAD:
        raise HTTPException(413, "Choose an image smaller than 4 MB.")
    try:
        with Image.open(BytesIO(payload), formats=["JPEG", "PNG", "WEBP"]) as original:
            if original.width * original.height > MAX_PIXELS:
                raise HTTPException(422, "Choose an image with at most 16 megapixels.")
            if min(original.size) < 32 or getattr(original, "n_frames", 1) != 1:
                raise HTTPException(
                    422, "Choose a still card image at least 32 pixels on each side."
                )
            original.load()
            oriented = ImageOps.exif_transpose(original)
            rgba = oriented.convert("RGBA")
            # Flatten transparent images onto white, and save a new JPEG without EXIF/GPS data.
            image = Image.new("RGB", rgba.size, "white")
            image.paste(rgba, mask=rgba.getchannel("A"))
            image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
            result = BytesIO()
            image.save(result, "JPEG", quality=85, optimize=True)
            if result.tell() > 1024 * 1024:
                raise HTTPException(422, "This image is too complex. Choose a smaller card photo.")
            return result.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(422, "Choose a valid JPEG, PNG, or WebP image.") from None


def photo_path(root: Path, owner_id: UUID, key: UUID) -> Path:
    # Both path segments come from UUID database columns, never user filenames.
    return root / str(owner_id) / f"{key}.jpg"


def write_photo(root: Path, owner_id: UUID, key: UUID, payload: bytes):
    path = photo_path(root, owner_id, key)
    try:
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with os.fdopen(os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), "wb") as file:
            file.write(payload)
    except OSError:
        remove_photo(root, owner_id, key)
        raise HTTPException(
            503, "Photo storage is temporarily unavailable. Please retry."
        ) from None


def remove_photo(root: Path, owner_id: UUID, key: UUID | None):
    if key is None:
        return
    try:
        photo_path(root, owner_id, key).unlink(missing_ok=True)
    except OSError:
        # The database transaction has already committed; do not report a false save failure.
        logger.warning("orphan_photo_cleanup_needed")
