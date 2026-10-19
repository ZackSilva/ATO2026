import hashlib
import hmac
import re

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=1)
# Missing accounts still perform password verification; never store this as a real credential.
dummy_hash = password_hasher.hash("not-an-account-password")
USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,63}$")


def normalize_username(value: str) -> str:
    value = value.strip().lower()
    if not USERNAME.fullmatch(value):
        raise ValueError("Use 3–64 letters, numbers, dots, underscores, or hyphens")
    return value


def check_password(password: str, encoded: str) -> bool:
    try:
        return password_hasher.verify(encoded, password)
    except VerificationError:
        return False


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def csrf_token(session_token: str) -> str:
    return hmac.new(session_token.encode(), b"slabtrak-csrf-v1", hashlib.sha256).hexdigest()
