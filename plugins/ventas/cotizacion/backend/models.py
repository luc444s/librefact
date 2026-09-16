from __future__ import annotations

from datetime import UTC, date, datetime, time
from uuid import uuid4

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from systutor.core.database import Base


def _new_uuid() -> str:
    return str(uuid4())


def _utc_now() -> datetime:
    return datetime.now(UTC)


class QuoteDraft(Base):
    __tablename__ = "ventas_quote_drafts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "quote_number", name="uq_quote_draft_tenant_quote_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="DRAFT", index=True)
    delivery_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    delivery_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    vehicle_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    vehicle_plate: Mapped[str | None] = mapped_column(String(20), nullable=True)
    conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="PEN")
    customer_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_document: Mapped[str | None] = mapped_column(String(50), nullable=True)
    customer_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    warehouse_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    seller_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    updated_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now
    )

    items: Mapped[list[QuoteItem]] = relationship(
        back_populates="quote_draft", cascade="all, delete-orphan"
    )


class QuoteItem(Base):
    __tablename__ = "ventas_quote_items"
    __table_args__ = (
        UniqueConstraint("quote_draft_id", "product_id", name="uq_quote_item_draft_product"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    quote_draft_id: Mapped[str] = mapped_column(
        ForeignKey("ventas_quote_drafts.id"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(
        ForeignKey("prod_products.id"), nullable=False, index=True
    )
    product_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    line_total: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    unit_weight_kg: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)

    quote_draft: Mapped[QuoteDraft] = relationship(back_populates="items")
