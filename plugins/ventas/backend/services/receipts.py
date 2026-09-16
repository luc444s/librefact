from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from plugins.crm.backend.services.customers import require_customer
from plugins.logistics.backend.models import LogisticsCylinder, LogisticsWarehouse
from plugins.logistics.backend.services.customer_possession import (
    EVENT_OUT_FROM_CUSTOMER,
    append_customer_possession_event,
)
from plugins.ventas.backend.models import SalesDispatch, SalesReceipt, SalesReceiptCostLine, SalesReceiptItem

VALID_STATUSES = ("PREPARADO", "INGRESADO", "CANCELADO")
TRANSITIONS: dict[str, set[str]] = {
    "PREPARADO": {"INGRESADO", "CANCELADO"},
    "INGRESADO": set(),
    "CANCELADO": set(),
}
BLOCKED_CYLINDER_STATES = {"BLOQUEADO", "DE_BAJA", "PERDIDO"}
SOURCE_TYPE = "VENTAS_INGRESO_DESDE_CLIENTE"


def _validate_status_transition(current: str, target: str) -> None:
    if target not in VALID_STATUSES:
        raise ValueError(f"Estado desconocido: {target}")
    if target not in TRANSITIONS.get(current, set()):
        raise ValueError(f"No se puede pasar de {current} a {target}")


def _validate_cylinder(db: Session, *, tenant_id: str, cylinder_id: str) -> LogisticsCylinder:
    cylinder = db.scalar(
        select(LogisticsCylinder).where(
            LogisticsCylinder.id == cylinder_id,
            LogisticsCylinder.tenant_id == tenant_id,
        )
    )
    if cylinder is None:
        raise ValueError(f"Cilindro {cylinder_id} no encontrado")
    if cylinder.current_state in BLOCKED_CYLINDER_STATES:
        raise ValueError(
            f"Cilindro {cylinder.serial or cylinder_id} no disponible (estado {cylinder.current_state})"
    )
    return cylinder


def _validate_warehouse(db: Session, *, tenant_id: str, warehouse_id: str) -> LogisticsWarehouse:
    warehouse = db.scalar(
        select(LogisticsWarehouse).where(
            LogisticsWarehouse.id == warehouse_id,
            LogisticsWarehouse.tenant_id == tenant_id,
        )
    )
    if warehouse is None:
        raise ValueError(f"Almacén {warehouse_id} no encontrado")
    return warehouse


def _validate_dispatch(db: Session, *, tenant_id: str, dispatch_id: str) -> SalesDispatch:
    dispatch = db.scalar(
        select(SalesDispatch).where(
            SalesDispatch.id == dispatch_id,
            SalesDispatch.tenant_id == tenant_id,
        )
    )
    if dispatch is None:
        raise ValueError(f"Despacho {dispatch_id} no encontrado")
    return dispatch


def create_receipt(
    db: Session,
    *,
    tenant_id: str,
    customer_id: str,
    warehouse_id: str,
    dispatch_id: str,
    receipt_date: date | None,
    notes: str | None,
    cylinders_payload: list[dict],
    tank_id: str | None,
    cost_lines: list[dict] | None,
    created_by: str,
) -> SalesReceipt:
    customer = require_customer(db, tenant_id=tenant_id, customer_id=customer_id)
    dispatch = _validate_dispatch(db, tenant_id=tenant_id, dispatch_id=dispatch_id)
    _validate_warehouse(db, tenant_id=tenant_id, warehouse_id=warehouse_id)

    if dispatch.customer_id != customer.id:
        raise ValueError("El cliente del ingreso no coincide con el despacho")

    seen: set[str] = set()
    for entry in cylinders_payload:
        cylinder_id = entry["cylinder_id"]
        if cylinder_id in seen:
            raise ValueError(f"Serial duplicado dentro del ingreso: {cylinder_id}")
        seen.add(cylinder_id)

    cylinders = {cylinder_id: _validate_cylinder(db, tenant_id=tenant_id, cylinder_id=cylinder_id) for cylinder_id in seen}
    dispatch_cylinder_ids = {item.cylinder_id for item in dispatch.items}
    if not dispatch_cylinder_ids:
        raise ValueError("El despacho no tiene cilindros para recepcionar")
    if not seen.issubset(dispatch_cylinder_ids):
        raise ValueError("Los cilindros del ingreso no coinciden con el despacho")

    receipt = SalesReceipt(
        tenant_id=tenant_id,
        customer_id=customer.id,
        customer_name=getattr(customer, "commercial_name", None) or getattr(customer, "legal_name", None),
        warehouse_id=warehouse_id,
        dispatch_id=dispatch.id,
        tank_id=tank_id,
        status="PREPARADO",
        receipt_date=receipt_date or date.today(),
        notes=notes,
        created_by=created_by,
    )
    db.add(receipt)
    db.flush()

    for entry in cylinders_payload:
        cylinder = cylinders[entry["cylinder_id"]]
        db.add(
            SalesReceiptItem(
                receipt_id=receipt.id,
                cylinder_id=cylinder.id,
                serial=cylinder.serial,
                product_id=cylinder.product_id,
                incoming_qty=float(entry.get("incoming_qty") or 1),
                status="PENDIENTE",
                notes=entry.get("notes"),
            )
        )

    for entry in cost_lines or []:
        db.add(
            SalesReceiptCostLine(
                tenant_id=tenant_id,
                receipt_id=receipt.id,
                cost_type=entry["cost_type"],
                amount=float(entry["amount"]),
                currency=entry.get("currency") or "PEN",
                notes=entry.get("notes"),
            )
        )
    db.flush()
    return receipt


def list_receipts(
    db: Session,
    *,
    tenant_id: str,
    status: str | None = None,
    customer_id: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> tuple[list[SalesReceipt], int]:
    stmt = select(SalesReceipt).where(SalesReceipt.tenant_id == tenant_id)
    count_stmt = select(func.count()).select_from(SalesReceipt).where(SalesReceipt.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(SalesReceipt.status == status)
        count_stmt = count_stmt.where(SalesReceipt.status == status)
    if customer_id:
        stmt = stmt.where(SalesReceipt.customer_id == customer_id)
        count_stmt = count_stmt.where(SalesReceipt.customer_id == customer_id)
    total = db.scalar(count_stmt) or 0
    stmt = stmt.order_by(SalesReceipt.created_at.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt).all()), total


def get_receipt(db: Session, *, tenant_id: str, receipt_id: str) -> SalesReceipt | None:
    return db.scalar(
        select(SalesReceipt).where(
            SalesReceipt.id == receipt_id,
            SalesReceipt.tenant_id == tenant_id,
        )
    )


def transition(
    db: Session,
    *,
    receipt: SalesReceipt,
    target: str,
    user_id: str | None = None,
) -> SalesReceipt:
    _validate_status_transition(receipt.status, target)

    if target == "INGRESADO":
        items = list(receipt.items)
        if not items:
            raise ValueError("No se puede ingresar sin items")
        now = datetime.now(UTC)
        for item in items:
            item.status = "INGRESADO"
            item.confirmed_at = now
            db.add(item)
            append_customer_possession_event(
                db,
                tenant_id=receipt.tenant_id,
                customer_id=receipt.customer_id,
                source_type=SOURCE_TYPE,
                source_id=item.id,
                event_type=EVENT_OUT_FROM_CUSTOMER,
                product_id=item.product_id,
                product_name=None,
                quantity=float(item.incoming_qty),
                created_by=user_id or receipt.created_by,
                occurred_at=now,
                notes=item.notes or receipt.notes,
                cylinder_id=item.cylinder_id,
                trace_mode="SERIALIZED",
            )

    if target == "CANCELADO":
        for item in list(receipt.items):
            item.status = "CANCELADO"
            db.add(item)

    receipt.status = target
    db.add(receipt)
    db.flush()
    return receipt


def confirm_receipt(db: Session, *, receipt: SalesReceipt, user_id: str | None = None) -> SalesReceipt:
    return transition(db, receipt=receipt, target="INGRESADO", user_id=user_id)


def cancel_receipt(db: Session, *, receipt: SalesReceipt, user_id: str | None = None) -> SalesReceipt:
    return transition(db, receipt=receipt, target="CANCELADO", user_id=user_id)
