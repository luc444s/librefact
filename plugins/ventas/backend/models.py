from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from systutor.core.database import Base


def _new_uuid() -> str:
    return str(uuid4())


def _utc_now() -> datetime:
    return datetime.now(UTC)


class SalesOrder(Base):
    __tablename__ = "ventas_orders"
    __table_args__ = (
        Index(
            "uq_ventas_orders_tenant_source_quote_id",
            "tenant_id",
            "source_quote_id",
            unique=True,
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id: Mapped[str] = mapped_column(
        ForeignKey("crm_customers.id"), nullable=False, index=True
    )
    source_quote_id: Mapped[str | None] = mapped_column(
        ForeignKey("ventas_quote_drafts.id"), nullable=True, index=True
    )
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT", index=True)
    order_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today, index=True)
    expected_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now
    )

    items: Mapped[list[SalesOrderItem]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )
    events: Mapped[list[SalesOrderEvent]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class SalesOrderEvent(Base):
    __tablename__ = "ventas_order_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("ventas_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)

    order: Mapped[SalesOrder] = relationship(back_populates="events")


class SalesOrderItem(Base):
    __tablename__ = "ventas_order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("ventas_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    line_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    dispatched_qty: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    order: Mapped[SalesOrder] = relationship(back_populates="items")


class SalesDispatch(Base):
    __tablename__ = "ventas_dispatches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    warehouse_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    tank_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PREPARADO", index=True)
    dispatch_date: Mapped[date] = mapped_column(
        Date, nullable=False, default=date.today, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now
    )

    items: Mapped[list[SalesDispatchItem]] = relationship(
        back_populates="dispatch", cascade="all, delete-orphan"
    )
    cost_lines: Mapped[list[SalesDispatchCostLine]] = relationship(
        back_populates="dispatch", cascade="all, delete-orphan"
    )


class SalesDispatchItem(Base):
    __tablename__ = "ventas_dispatch_items"
    __table_args__ = (
        UniqueConstraint(
            "dispatch_id", "cylinder_id", name="uq_ventas_dispatch_item_dispatch_cylinder"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    dispatch_id: Mapped[str] = mapped_column(
        ForeignKey("ventas_dispatches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cylinder_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    serial: Mapped[str | None] = mapped_column(String(50), nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    outgoing_qty: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDIENTE", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    dispatch: Mapped[SalesDispatch] = relationship(back_populates="items")


class SalesDispatchCostLine(Base):
    __tablename__ = "ventas_dispatch_cost_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    dispatch_id: Mapped[str] = mapped_column(
        ForeignKey("ventas_dispatches.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cost_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(19, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="PEN")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    dispatch: Mapped[SalesDispatch] = relationship(back_populates="cost_lines")


class SalesReceipt(Base):
    __tablename__ = "ventas_receipts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    customer_id: Mapped[str] = mapped_column(
        ForeignKey("crm_customers.id"), nullable=False, index=True
    )
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    warehouse_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    dispatch_id: Mapped[str | None] = mapped_column(
        ForeignKey("ventas_dispatches.id"), nullable=True, index=True
    )
    tank_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PREPARADO", index=True)
    receipt_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, onupdate=_utc_now
    )

    items: Mapped[list[SalesReceiptItem]] = relationship(
        back_populates="receipt", cascade="all, delete-orphan"
    )
    cost_lines: Mapped[list[SalesReceiptCostLine]] = relationship(
        back_populates="receipt", cascade="all, delete-orphan"
    )


class SalesReceiptItem(Base):
    __tablename__ = "ventas_receipt_items"
    __table_args__ = (
        UniqueConstraint(
            "receipt_id", "cylinder_id", name="uq_ventas_receipt_item_receipt_cylinder"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    receipt_id: Mapped[str] = mapped_column(
        ForeignKey("ventas_receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cylinder_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    serial: Mapped[str | None] = mapped_column(String(50), nullable=True)
    product_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    incoming_qty: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDIENTE", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    receipt: Mapped[SalesReceipt] = relationship(back_populates="items")


class SalesReceiptCostLine(Base):
    __tablename__ = "ventas_receipt_cost_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    receipt_id: Mapped[str] = mapped_column(
        ForeignKey("ventas_receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cost_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(19, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="PEN")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    receipt: Mapped[SalesReceipt] = relationship(back_populates="cost_lines")
