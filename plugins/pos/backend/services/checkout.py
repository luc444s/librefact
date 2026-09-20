from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from plugins.pos.backend.common import PosActionContext, audit_pos_action, emit_pos_event
from plugins.pos.backend.models import PosCashSession, PosPayment
from plugins.pos.backend.schemas import PosSaleItemRead, PosSaleRead
from plugins.stock.backend.common import StockActionContext
from plugins.ventas.backend.models import SalesOrder
from plugins.ventas.backend.services import orders as orders_service

CASH_METHOD = "EFECTIVO"


def _new_uuid() -> str:
    return str(uuid4())


def serialize_sale(order: SalesOrder) -> PosSaleRead:
    items = [
        PosSaleItemRead(
            product_id=item.product_id,
            quantity=float(item.quantity),
            unit_price=float(item.unit_price),
            line_total=float(item.line_total),
        )
        for item in order.items
    ]
    return PosSaleRead(
        order_id=order.id,
        document_type=order.document_type,
        document_full_number=order.document_full_number,
        status=order.status,
        total=round(sum(item.line_total for item in items), 2),
        items=items,
        created_at=order.created_at or datetime.now(UTC),
    )


def checkout(
    db: Session,
    *,
    session: PosCashSession,
    items_payload: list[dict],
    method: str,
    received_amount: float | None,
    user_id: str,
    action_context: PosActionContext,
    stock_action_context: StockActionContext,
    notes: str | None = None,
) -> tuple[SalesOrder, PosPayment]:
    if session.status != "OPEN":
        raise ValueError("No hay una caja abierta para cobrar")

    order = orders_service.create_order(
        db,
        tenant_id=session.tenant_id,
        document_type="BOLETA",
        customer_id=None,
        customer_name=None,
        customer_document_type=None,
        customer_document_number=None,
        items_payload=items_payload,
        expected_date=None,
        notes=notes or "Venta POS",
        created_by=user_id,
    )
    order = orders_service.confirm_order(db, order=order, user_id=user_id)
    order = orders_service.dispatch_order(
        db,
        order=order,
        warehouse_id=session.warehouse_id,
        action_context=stock_action_context,
        user_id=user_id,
    )

    total = round(sum(float(item.line_total) for item in order.items), 2)
    received = round(float(received_amount), 2) if received_amount is not None else None
    change: float | None = None
    if method == CASH_METHOD and received is not None:
        if received < total:
            raise ValueError("El monto recibido es menor al total de la venta")
        change = round(received - total, 2)

    payment = PosPayment(
        id=_new_uuid(),
        tenant_id=session.tenant_id,
        session_id=session.id,
        order_id=order.id,
        method=method,
        amount=total,
        received_amount=received,
        change_amount=change,
        created_by=user_id,
        created_at=datetime.now(UTC),
    )
    db.add(payment)
    db.flush()

    audit_pos_action(
        db,
        context=action_context,
        action="sale.checkout",
        entity_type="pos_payment",
        entity_id=payment.id,
        details={
            "session_id": session.id,
            "order_id": order.id,
            "method": method,
            "amount": total,
            "change_amount": change,
        },
    )
    emit_pos_event(
        db,
        context=action_context,
        event_name="pos.sale.completed",
        entity_type="pos_payment",
        entity_id=payment.id,
        payload={
            "session_id": session.id,
            "order_id": order.id,
            "document_full_number": order.document_full_number,
            "method": method,
            "amount": total,
            "change_amount": change,
        },
    )
    return order, payment
