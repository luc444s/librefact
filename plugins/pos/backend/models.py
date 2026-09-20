from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from systutor.core.database import Base


def _new_uuid() -> str:
    return str(uuid4())


def _utc_now() -> datetime:
    return datetime.now(UTC)


class PosCashSession(Base):
    __tablename__ = "pos_cash_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    warehouse_id: Mapped[str] = mapped_column(ForeignKey("branches.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN", index=True)
    opening_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    counted_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    expected_cash_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    difference: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    opened_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    closed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PosPayment(Base):
    __tablename__ = "pos_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(
        ForeignKey("pos_cash_sessions.id"), nullable=False, index=True
    )
    order_id: Mapped[str] = mapped_column(
        ForeignKey("ventas_orders.id"), nullable=False, index=True
    )
    method: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    received_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    change_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
