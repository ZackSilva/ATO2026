"""Import a manually researched evidence file into existing cards; never invent costs.

Operator command, dry-run by default. Reads JSON, not marketplace pages. The caller
chooses the owner explicitly; no accounts, card identities, or copies are created.
"""

import argparse
import hashlib
import json
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, text

from slabtrak.config import Settings
from slabtrak.db import database
from slabtrak.estimates import WINDOW_DAYS, ComparableInput, comparable_key
from slabtrak.inventory import DEFINITION_FIELDS, CardInput
from slabtrak.models import Account, CardDefinition, ComparableSale, OwnedCopy
from slabtrak.security import normalize_username


class EvidenceCard(BaseModel):
    model_config = ConfigDict(extra="forbid")

    identity: CardInput
    research_url: str
    sales: list[ComparableInput] = Field(min_length=1)

    @model_validator(mode="after")
    def identity_only(self):
        if self.identity.model_fields_set - set(DEFINITION_FIELDS):
            raise ValueError("Evidence identities cannot set purchase, grading, or copy fields.")
        ComparableInput.safe_source(self.research_url)
        if not self.research_url.startswith("https://"):
            raise ValueError("Research URLs must use HTTPS.")
        if any(not sale.source_url for sale in self.sales):
            raise ValueError("Research and individual sale URLs are required.")
        return self


class EvidencePack(BaseModel):
    model_config = ConfigDict(extra="forbid")

    checked_on: date
    cards: list[EvidenceCard] = Field(min_length=1)


def import_evidence(
    db, username: str, pack: EvidencePack, *, apply: bool = False, include_history: bool = False
) -> list[dict]:
    """Preflight the entire file, then append only missing sales in one transaction.

    The caller commits or rolls back. Repeating an unchanged file is harmless;
    changing a previously recorded transaction requires deliberate manual review.
    """
    today = datetime.now(UTC).date()
    if pack.checked_on > today:
        raise ValueError("Research cannot be checked in the future.")
    # Serialize imports for duplicate preflight; normal API writes still use the
    # database's owner/source uniqueness constraint and cannot inflate the sample.
    db.execute(text("SELECT pg_advisory_xact_lock(837201902)"))
    owner = db.scalar(select(Account).where(Account.username == normalize_username(username)))
    if owner is None:
        raise ValueError("Account not found.")
    existing = {
        sale.source_key: sale
        for sale in db.scalars(select(ComparableSale).where(ComparableSale.owner_id == owner.id))
    }
    planned = {}
    summary = []
    for entry in pack.cards:
        identity = entry.identity.model_dump(include=set(DEFINITION_FIELDS))
        fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        definition = db.scalar(
            select(CardDefinition).where(
                CardDefinition.owner_id == owner.id,
                CardDefinition.fingerprint == fingerprint,
                select(OwnedCopy.id)
                .where(
                    OwnedCopy.owner_id == owner.id,
                    OwnedCopy.definition_id == CardDefinition.id,
                )
                .exists(),
            )
        )
        if definition is None:
            raise ValueError(
                f"No existing card matches the exact identity: {entry.identity.subject}."
            )
        counts = {"subject": definition.subject, "added": 0, "skipped": 0}
        for data in entry.sales:
            if data.sold_on > pack.checked_on:
                raise ValueError("Evidence cannot be dated later than its check date.")
            if not include_history and data.sold_on < today - timedelta(days=WINDOW_DAYS - 1):
                raise ValueError(
                    "Evidence must be within 180 days and no later than its check date."
                )
            key = comparable_key(definition.id, data)
            previous = existing.get(key) or planned.get(key)
            if previous is not None:
                previous_data = (
                    {name: getattr(previous, name) for name in ComparableInput.model_fields}
                    if key in existing
                    else previous[1].model_dump()
                )
                previous_definition = previous.definition_id if key in existing else previous[0]
                # Listing photos are optional annotations, not transaction facts.
                previous_data.pop("image_url", None)
                if previous_definition != definition.id or previous_data != data.model_dump(
                    exclude={"image_url"}
                ):
                    raise ValueError(
                        "A sale URL already exists with different facts or card identity."
                    )
                counts["skipped"] += 1
            else:
                planned[key] = (definition.id, data)
                counts["added"] += 1
        summary.append(counts)
    if apply:
        for key, (definition_id, data) in planned.items():
            db.add(
                ComparableSale(
                    owner_id=owner.id,
                    definition_id=definition_id,
                    source_key=key,
                    created_at=datetime.now(UTC),
                    **data.model_dump(),
                )
            )
        db.flush()
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", required=True)
    parser.add_argument("--file", required=True, help="Researched JSON file, or - for stdin")
    parser.add_argument(
        "--apply", action="store_true", help="Append missing sales; default is dry-run"
    )
    parser.add_argument(
        "--include-history",
        action="store_true",
        help="Allow older completed sales for charts; current estimates still use 180 days",
    )
    args = parser.parse_args()
    engine = None
    try:
        payload = sys.stdin.read() if args.file == "-" else Path(args.file).read_text()
        pack = EvidencePack.model_validate_json(payload)
        engine, sessions = database(Settings())
        with sessions() as db:
            summary = import_evidence(
                db, args.username, pack, apply=args.apply, include_history=args.include_history
            )
            if args.apply:
                db.commit()
        print("Applied evidence." if args.apply else "Dry-run only; no records changed.")
        for item in summary:
            print(
                f"{item['subject']}: {item['added']} new sales; {item['skipped']} unchanged sales."
            )
        print("Card records, acquisition costs, photos, and credentials are unchanged.")
    except (ValueError, OSError) as error:
        parser.error(str(error))
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    main()
