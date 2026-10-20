"""Validate external source and listing-preview URLs without fetching them."""

import ipaddress
from urllib.parse import urlsplit, urlunsplit


def safe_url(value) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        return ""
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value)
        ):
            return ""
        return urlunsplit(parsed._replace(fragment=""))
    except ValueError:
        return ""


def safe_image_url(value) -> str | None:
    """Expose only public HTTPS previews; images are never fetched by the API."""
    url = safe_url(value)
    if not url:
        return None
    try:
        parsed = urlsplit(url)
        host = parsed.hostname.rstrip(".").lower()
        # Accessing port also rejects malformed or out-of-range port values.
        _ = parsed.port
        if parsed.scheme != "https" or host == "localhost" or host.endswith(".localhost"):
            return None
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if (
                "." not in host
                or host.endswith((".local", ".internal"))
                or host.rsplit(".", 1)[-1].isdigit()
            ):
                return None
        else:
            if not address.is_global or address.is_multicast:
                return None
        return url
    except ValueError:
        return None
