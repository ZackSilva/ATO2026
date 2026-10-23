from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

RawCondition = Literal["unspecified", "near_mint", "excellent", "good", "fair", "poor"]
RAW_CONDITION_CHECK = (
    "raw_condition IN ('unspecified', 'near_mint', 'excellent', 'good', 'fair', 'poor') "
    "AND (condition = 'raw' OR raw_condition = 'unspecified')"
)


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = {"schema": "slabtrak"}

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginSession(Base):
    __tablename__ = "sessions"
    __table_args__ = {"schema": "slabtrak"}

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("slabtrak.accounts.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class LoginLimit(Base):
    __tablename__ = "login_limits"
    __table_args__ = (
        CheckConstraint("failures >= 0"),
        {"schema": "slabtrak"},
    )

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class CardDefinition(Base):
    """An immutable card identity, shared by an owner's matching physical copies."""

    __tablename__ = "card_definitions"
    __table_args__ = (
        UniqueConstraint("id", "owner_id"),
        UniqueConstraint("owner_id", "fingerprint"),
        CheckConstraint("year IS NULL OR year BETWEEN 1800 AND 2200"),
        CheckConstraint("print_run IS NULL OR print_run > 0"),
        {"schema": "slabtrak"},
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(ForeignKey("slabtrak.accounts.id", ondelete="CASCADE"))
    fingerprint: Mapped[str] = mapped_column(String(64))
    subject: Mapped[str] = mapped_column(String(200))
    year: Mapped[int | None] = mapped_column(Integer)
    sport: Mapped[str] = mapped_column(String(100))
    manufacturer: Mapped[str] = mapped_column(String(100))
    set_name: Mapped[str] = mapped_column(String(150))
    card_number: Mapped[str] = mapped_column(String(50))
    parallel: Mapped[str] = mapped_column(String(150))
    autograph: Mapped[bool] = mapped_column(Boolean)
    memorabilia: Mapped[bool] = mapped_column(Boolean)
    print_run: Mapped[int | None] = mapped_column(Integer)


class OwnedCopy(Base):
    __tablename__ = "owned_copies"
    __table_args__ = (
        ForeignKeyConstraint(
            ["definition_id", "owner_id"],
            ["slabtrak.card_definitions.id", "slabtrak.card_definitions.owner_id"],
        ),
        CheckConstraint("condition IN ('raw', 'graded')"),
        CheckConstraint(RAW_CONDITION_CHECK, name="ck_owned_copies_raw_condition"),
        CheckConstraint("photo_kind IN ('upload', 'reference')", name="ck_owned_copies_photo_kind"),
        CheckConstraint(
            "back_photo_kind IN ('upload', 'reference')", name="ck_owned_copies_back_photo_kind"
        ),
        CheckConstraint("revision > 0"),
        CheckConstraint("serial_number IS NULL OR serial_number > 0"),
        CheckConstraint(
            "(sold AND NOT archived AND sale_price IS NOT NULL AND sale_fees IS NOT NULL) "
            "OR (NOT sold AND sale_price IS NULL AND sale_fees IS NULL AND sold_on IS NULL)",
            name="ck_owned_copies_sale_state",
        ),
        CheckConstraint("sale_price IS NULL OR sale_price >= 0", name="ck_owned_copies_sale_price"),
        CheckConstraint("sale_fees IS NULL OR sale_fees >= 0", name="ck_owned_copies_sale_fees"),
        *(
            CheckConstraint(f"{field} IS NULL OR {field} >= 0")
            for field in (
                "purchase_price",
                "shipping",
                "tax",
                "other_cost",
            )
        ),
        {"schema": "slabtrak"},
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        ForeignKey("slabtrak.accounts.id", ondelete="CASCADE"), index=True
    )
    definition_id: Mapped[UUID] = mapped_column()
    condition: Mapped[str] = mapped_column(String(10))
    raw_condition: Mapped[str] = mapped_column(
        String(12), default="unspecified", server_default="unspecified"
    )
    grader: Mapped[str] = mapped_column(String(50))
    grade: Mapped[str] = mapped_column(String(20))
    certification: Mapped[str] = mapped_column(String(100))
    centering: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    corners: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    edges: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    surface: Mapped[Decimal | None] = mapped_column(Numeric(3, 1))
    serial_number: Mapped[int | None] = mapped_column(Integer)
    purchase_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    shipping: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    tax: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    other_cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3))
    acquired_on: Mapped[date | None] = mapped_column(Date)
    seller: Mapped[str] = mapped_column(String(200))
    notes: Mapped[str] = mapped_column(String(2000))
    market_query: Mapped[str] = mapped_column(String(200), default="", server_default="")
    archived: Mapped[bool] = mapped_column(Boolean)
    sold: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    sale_fees: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    sold_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    photo_key: Mapped[UUID | None] = mapped_column()
    photo_kind: Mapped[str] = mapped_column(String(10), default="upload")
    photo_source: Mapped[str] = mapped_column(String(2048), default="")
    back_photo_key: Mapped[UUID | None] = mapped_column()
    back_photo_kind: Mapped[str] = mapped_column(String(10), default="upload")
    back_photo_source: Mapped[str] = mapped_column(String(2048), default="")

    __mapper_args__ = {"version_id_col": revision}


class MarketLink(Base):
    """A collector-confirmed provider reference; sale responses stay in an expiring cache."""

    __tablename__ = "market_links"
    __table_args__ = ({"schema": "slabtrak"},)

    copy_id: Mapped[UUID] = mapped_column(
        ForeignKey("slabtrak.owned_copies.id", ondelete="CASCADE"), primary_key=True
    )
    provider_card_id: Mapped[UUID] = mapped_column()
    provider_parallel_id: Mapped[UUID | None] = mapped_column()
    provider_grade_id: Mapped[UUID | None] = mapped_column()
    copy_signature: Mapped[str] = mapped_column(String(64))
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ComparableSale(Base):
    """Private, user-recorded completed sale tied to an immutable card identity."""

    __tablename__ = "comparable_sales"
    __table_args__ = (
        ForeignKeyConstraint(
            ["definition_id", "owner_id"],
            ["slabtrak.card_definitions.id", "slabtrak.card_definitions.owner_id"],
        ),
        UniqueConstraint("owner_id", "source_key"),
        CheckConstraint("price > 0"),
        CheckConstraint("condition IN ('raw', 'graded')"),
        CheckConstraint(RAW_CONDITION_CHECK, name="ck_comparable_sales_raw_condition"),
        CheckConstraint(
            "(condition = 'raw' AND grader = '' AND grade = '') OR "
            "(condition = 'graded' AND grader <> '' AND grade <> '')"
        ),
        {"schema": "slabtrak"},
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(
        ForeignKey("slabtrak.accounts.id", ondelete="CASCADE"), index=True
    )
    definition_id: Mapped[UUID] = mapped_column()
    source_key: Mapped[str] = mapped_column(String(64))
    sold_on: Mapped[date] = mapped_column(Date)
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3))
    condition: Mapped[str] = mapped_column(String(10))
    raw_condition: Mapped[str] = mapped_column(
        String(12), default="unspecified", server_default="unspecified"
    )
    grader: Mapped[str] = mapped_column(String(50))
    grade: Mapped[str] = mapped_column(String(20))
    source: Mapped[str] = mapped_column(String(120))
    source_url: Mapped[str] = mapped_column(String(2048))
    image_url: Mapped[str | None] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
