from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from plugins.crm.backend.services.customers import require_customer
from plugins.logistics.backend.models import LogisticsCylinder, LogisticsWarehouse
from plugins.logistics.backend.services.customer_possession import (
    EVENT_IN_TO_CUSTOMER,
    append_customer_possession_event,
)
from plugins.ventas.backend.models import SalesDispatch, SalesDispatchCostLine, SalesDispatchItem

VALID_STATUSES = ("PREPARADO", "DESPACHADO", "CANCELADO")
TRANSITIONS: dict[str, set[str]] = {
    "PREPARADO": {"DESPACHADO", "CANCELADO"},
    "DESPACHADO": set(),
    "CANCELADO": set(),
}
BLOCKED_CYLINDER_STATES = {"BLOQUEADO", "DE_BAJA", "PERDIDO"}
SOURCE_TYPE = "VENTAS_SALIDA_A_CLIENTE"


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
        raise ValueError(f"Cilindro {cylinder.serial or cylinder_id} no disponible (estado {cylinder.current_state})")
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


def _serial_map(db: Session, tenant_id: str, cylinder_ids: list[str]) -> dict[str, str | None]:
    if not cylinder_ids:
        return {}
    rows = db.execute(
        select(LogisticsCylinder.id, LogisticsCylinder.serial).where(
            LogisticsCylinder.tenant_id == tenant_id,
            LogisticsCylinder.id.in_(cylinder_ids),
        )
    ).all()
    return {cylinder_id: serial for cylinder_id, serial in rows}


def create_dispatch(
    db: Session,
    *,
    tenant_id: str,
    customer_id: str,
    warehouse_id: str | None,
    tank_id: str | None,
    dispatch_date: date | None,
    notes: str | None,
    cylinders_payload: list[dict],
    cost_lines: list[dict] | None,
    created_by: str,
) -> SalesDispatch:
    customer = require_customer(db, tenant_id=tenant_id, customer_id=customer_id)
    if warehouse_id is not None:
        _validate_warehouse(db, tenant_id=tenant_id, warehouse_id=warehouse_id)

    seen: set[str] = set()
    for entry in cylinders_payload:
        cylinder_id = entry["cylinder_id"]
        if cylinder_id in seen:
            raise ValueError(f"Serial duplicado dentro de la salida: {cylinder_id}")
        seen.add(cylinder_id)

    cylinders = {cylinder_id: _validate_cylinder(db, tenant_id=tenant_id, cylinder_id=cylinder_id) for cylinder_id in seen}

    dispatch = SalesDispatch(
        tenant_id=tenant_id,
        customer_id=customer.id,
        customer_name=customer.commercial_name or customer.legal_name,
        warehouse_id=warehouse_id,
        tank_id=tank_id,
        status="PREPARADO",
        dispatch_date=dispatch_date or date.today(),
        notes=notes,
        created_by=created_by,
    )
    db.add(dispatch)
    db.flush()

    for entry in cylinders_payload:
        cylinder = cylinders[entry["cylinder_id"]]
        db.add(
            SalesDispatchItem(
                dispatch_id=dispatch.id,
                cylinder_id=cylinder.id,
                serial=cylinder.serial,
                product_id=cylinder.product_id,
                outgoing_qty=float(entry.get("outgoing_qty") or 1),
                status="PENDIENTE",
                notes=entry.get("notes"),
            )
        )

    for entry in cost_lines or []:
        db.add(
            SalesDispatchCostLine(
                tenant_id=tenant_id,
                dispatch_id=dispatch.id,
                cost_type=entry["cost_type"],
                amount=float(entry["amount"]),
                currency=entry.get("currency") or "PEN",
                notes=entry.get("notes"),
            )
        )
    db.flush()
    return dispatch


def list_dispatches(
    db: Session,
    *,
    tenant_id: str,
    status: str | None = None,
    customer_id: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> tuple[list[SalesDispatch], int]:
    stmt = select(SalesDispatch).where(SalesDispatch.tenant_id == tenant_id)
    count_stmt = select(func.count()).select_from(SalesDispatch).where(SalesDispatch.tenant_id == tenant_id)
    if status:
        stmt = stmt.where(SalesDispatch.status == status)
        count_stmt = count_stmt.where(SalesDispatch.status == status)
    if customer_id:
        stmt = stmt.where(SalesDispatch.customer_id == customer_id)
        count_stmt = count_stmt.where(SalesDispatch.customer_id == customer_id)
    total = db.scalar(count_stmt) or 0
    stmt = stmt.order_by(SalesDispatch.created_at.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt).all()), total


def get_dispatch(db: Session, *, tenant_id: str, dispatch_id: str) -> SalesDispatch | None:
    return db.scalar(
        select(SalesDispatch).where(
            SalesDispatch.id == dispatch_id,
            SalesDispatch.tenant_id == tenant_id,
        )
    )


def transition(db: Session, *, dispatch: SalesDispatch, target: str, user_id: str | None = None) -> SalesDispatch:
    _validate_status_transition(dispatch.status, target)

    if target == "DESPACHADO":
        items = list(dispatch.items)
        if not items:
            raise ValueError("No se puede despachar sin items")
        now = datetime.now(UTC)
        for item in items:
            item.status = "DESPACHADO"
            item.confirmed_at = now
            db.add(item)
            append_customer_possession_event(
                db,
                tenant_id=dispatch.tenant_id,
                customer_id=dispatch.customer_id,
                source_type=SOURCE_TYPE,
                source_id=item.id,
                event_type=EVENT_IN_TO_CUSTOMER,
                product_id=item.product_id,
                product_name=None,
                quantity=float(item.outgoing_qty),
                created_by=user_id or dispatch.created_by,
                occurred_at=now,
                notes=item.notes or dispatch.notes,
                cylinder_id=item.cylinder_id,
                trace_mode="SERIALIZED",
            )

    dispatch.status = target
    db.add(dispatch)
    db.flush()
    return dispatch
