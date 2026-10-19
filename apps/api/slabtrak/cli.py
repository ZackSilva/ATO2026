"""Operator-only owner creation and password recovery; no public signup endpoint."""

import argparse
from datetime import UTC, datetime
from getpass import getpass

from sqlalchemy import delete, select, text

from slabtrak.config import Settings
from slabtrak.db import database
from slabtrak.models import Account, LoginSession
from slabtrak.security import normalize_username, password_hasher


def set_credentials(db, command: str, username: str, password: str):
    username = normalize_username(username)
    if not 12 <= len(password) <= 128:
        raise ValueError("Use a password between 12 and 128 characters.")
    db.execute(text("SELECT pg_advisory_xact_lock(837201901)"))
    account = db.scalar(select(Account).where(Account.username == username))
    if command == "create-owner":
        if db.scalar(select(Account.id).limit(1)):
            raise ValueError("An owner already exists. Public signup is disabled.")
        account = Account(
            username=username,
            password_hash=password_hasher.hash(password),
            created_at=datetime.now(UTC),
        )
        db.add(account)
    else:
        if not account:
            raise ValueError("Account not found.")
        account.password_hash = password_hasher.hash(password)
        db.execute(delete(LoginSession).where(LoginSession.account_id == account.id))
    db.commit()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["create-owner", "reset-password"])
    parser.add_argument("--username", required=True)
    args = parser.parse_args()
    password = getpass("Password (12–128 characters): ")
    if password != getpass("Repeat password: "):
        parser.error("Passwords did not match.")
    engine, sessions = database(Settings())
    try:
        with sessions() as db:
            set_credentials(db, args.command, args.username, password)
    except ValueError as error:
        parser.error(str(error))
    finally:
        engine.dispose()
    print(
        "Owner created." if args.command == "create-owner" else "Password reset; sessions revoked."
    )


if __name__ == "__main__":
    main()
