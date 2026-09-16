from __future__ import annotations

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from plugins.ventas.backend.models import SalesOrder, SalesOrderEvent, SalesOrderItem

VALID_STATUSES = ("DRAFT", "CONFIRMED", "PARTIAL", "DISPATCHED", "CLOSED", "CANCELLED")
TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"CONFIRMED", "CANCELLED"},
    "CONFIRMED": {"PARTIAL", "DISPATCHED", "CANCELLED", "CLOSED"},
    "PARTIAL": {"DISPATCHED", "CANCELLED", "CLOSED"},
    "DISPATCHED": {"CLOSED"},
    "CLOSED": set(),
    "CANCELLED": set(),
}


def _validate_status_transition(current: str, target: str) -> None:
    if target not in VALID_STATUSES:
        raise ValueError(f"Estado desconocido: {target}")
    if target not in TRANSITIONS.get(current, set()):
        raise ValueError(f"No se puede pasar de {current} a {target}")


def transition(
    db: Session,
    *,
    order: SalesOrder,
    target: str,
    user_id: str | None = None,
    reason: str | None = None,
) -> SalesOrder:
    _validate_status_transition(order.status, target)

    if target == "CONFIRMED" and not order.items:
        raise ValueError("No se puede confirmar un pedido sin items")
    if target == "DISPATCHED" and not order.items:
        raise ValueError("No se puede despachar un pedido sin items")
    if target == "CANCELLED":
        dispatched = any(float(item.dispatched_qty) > 0 for item in order.items)
        if dispatched:
            raise ValueError("No se puede cancelar un pedido con cantidades ya despachadas")
    if target == "CLOSED" and not (reason and reason.strip()):
        raise ValueError("El cierre administrativo requiere un motivo")

    event = SalesOrderEvent(
        order_id=order.id,
        from_status=order.status,
        to_status=target,
        reason=reason,
        user_id=user_id,
    )
    db.add(event)
    order.status = target
    db.add(order)
    db.flush()
    return order


def _base_query(tenant_id: str, status: str | None = None, customer_id: str | None = None):
    stmt = select(SalesOrder).where(SalesOrder.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(SalesOrder.status == status)
    if customer_id:
        stmt = stmt.where(SalesOrder.customer_id == customer_id)
    return stmt


def list_orders(
    db: Session,
    *,
    tenant_id: str,
    status: str | None = None,
    customer_id: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> tuple[list[SalesOrder], int]:
    stmt = _base_query(tenant_id, status, customer_id)

    count_stmt = select(func.count()).select_from(SalesOrder).where(SalesOrder.tenant_id == tenant_id)
    if status:
        count_stmt = count_stmt.where(SalesOrder.status == status)
    if customer_id:
        count_stmt = count_stmt.where(SalesOrder.customer_id == customer_id)
    total = db.scalar(count_stmt) or 0

    stmt = stmt.order_by(SalesOrder.order_date.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt).all()), total


def get_order(db: Session, *, tenant_id: str, order_id: str) -> SalesOrder | None:
    return db.scalar(
        select(SalesOrder).where(SalesOrder.id == order_id, SalesOrder.tenant_id == tenant_id)
    )


def create_order(
    db: Session,
    *,
    tenant_id: str,
    customer_id: str,
    customer_name: str | None,
    items_payload: list[dict],
    expected_date: date | None,
    notes: str | None,
    created_by: str,
) -> SalesOrder:
    order = SalesOrder(
        tenant_id=tenant_id,
        customer_id=customer_id,
        customer_name=customer_name,
        status="DRAFT",
        order_date=date.today(),
        expected_date=expected_date,
        notes=notes,
        created_by=created_by,
    )
    db.add(order)
    db.flush()

    for item in items_payload:
        quantity = float(item["quantity"])
        unit_price = float(item["unit_price"])
        line_total = (
            float(item["line_total"]) if item.get("line_total") is not None else round(quantity * unit_price, 2)
        )
        db.add(
            SalesOrderItem(
                order_id=order.id,
                product_id=item["product_id"],
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
                dispatched_qty=0,
            )
        )
    db.flush()
    return order


def update_order(
    db: Session,
    *,
    order: SalesOrder,
    payload: dict,
) -> SalesOrder:
    if order.status != "DRAFT":
        raise ValueError("Solo se puede editar un pedido en estado DRAFT")

    if "customer_id" in payload and payload["customer_id"] is not None:
        order.customer_id = payload["customer_id"]
    if "customer_name" in payload:
        order.customer_name = payload["customer_name"]
    for field in ("expected_date", "notes"):
        if field in payload:
            setattr(order, field, payload[field])

    if "items" in payload and payload["items"] is not None:
        for item in list(order.items):
            db.delete(item)
        db.flush()
        for item in payload["items"]:
            quantity = float(item["quantity"])
            unit_price = float(item["unit_price"])
            line_total = (
                float(item["line_total"]) if item.get("line_total") is not None else round(quantity * unit_price, 2)
            )
            db.add(
                SalesOrderItem(
                    order_id=order.id,
                    product_id=item["product_id"],
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                    dispatched_qty=0,
                )
            )

    db.add(order)
    db.flush()
    return order


def confirm_order(db: Session, *, order: SalesOrder, user_id: str | None = None) -> SalesOrder:
    return transition(db, order=order, target="CONFIRMED", user_id=user_id)


def dispatch_order(
    db: Session,
    *,
    order: SalesOrder,
    user_id: str | None = None,
    reason: str | None = None,
) -> SalesOrder:
    return transition(db, order=order, target="DISPATCHED", user_id=user_id, reason=reason)


def cancel_order(
    db: Session,
    *,
    order: SalesOrder,
    user_id: str | None = None,
    reason: str | None = None,
) -> SalesOrder:
    return transition(db, order=order, target="CANCELLED", user_id=user_id, reason=reason)


def close_order(
    db: Session,
    *,
    order: SalesOrder,
    user_id: str | None = None,
    reason: str,
) -> SalesOrder:
    return transition(db, order=order, target="CLOSED", user_id=user_id, reason=reason)
