from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from systutor.kernel.tenants.context import TenantContext

from plugins.logistics.backend.models import LogisticsCylinder
from plugins.ventas.backend.models import SalesDispatch
from plugins.ventas.backend.routers.common import (
    DB_SESSION,
    REQUIRE_SALES_DISPATCH_MANAGE,
    REQUIRE_SALES_DISPATCH_READ,
    TENANT_CONTEXT,
)
from plugins.ventas.backend.schemas import (
    SalesDispatchCreateRequest,
    SalesDispatchPageRead,
    SalesDispatchRead,
)
from plugins.ventas.backend.services import dispatches as dispatch_service

router = APIRouter(prefix="/salidas-a-cliente", tags=["ventas"])


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


def _serialize_dispatch(db: Session, dispatch: SalesDispatch) -> dict:
    serials = _serial_map(db, dispatch.tenant_id, [item.cylinder_id for item in dispatch.items])  # type: ignore[attr-defined]
    return {
        "id": dispatch.id,
        "customer": {"id": dispatch.customer_id, "name": dispatch.customer_name} if dispatch.customer_id else None,
        "customer_name": dispatch.customer_name,
        "warehouse_id": dispatch.warehouse_id,
        "tank_id": dispatch.tank_id,
        "status": dispatch.status,
        "dispatch_date": dispatch.dispatch_date,
        "notes": dispatch.notes,
        "created_by": dispatch.created_by,
        "created_at": dispatch.created_at,
        "updated_at": dispatch.updated_at,
        "items": [
            {
                "id": item.id,
                "cylinder_id": item.cylinder_id,
                "serial": item.serial or serials.get(item.cylinder_id),
                "product_id": item.product_id,
                "outgoing_qty": float(item.outgoing_qty),
                "status": item.status,
                "notes": item.notes,
                "confirmed_at": item.confirmed_at,
            }
            for item in dispatch.items  # type: ignore[attr-defined]
        ],
        "cost_lines": [
            {
                "id": line.id,
                "cost_type": line.cost_type,
                "amount": float(line.amount),
                "currency": line.currency,
                "notes": line.notes,
            }
            for line in getattr(dispatch, "cost_lines", [])
        ],
    }


@router.get("", response_model=SalesDispatchPageRead, dependencies=[REQUIRE_SALES_DISPATCH_READ])
def list_dispatches_endpoint(
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
    status: str | None = None,
    customer_id: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> dict:
    items, total = dispatch_service.list_dispatches(
        db,
        tenant_id=tenant_context.current_tenant_id,
        status=status,
        customer_id=customer_id,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [_serialize_dispatch(db, item) for item in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", response_model=SalesDispatchRead, status_code=status.HTTP_201_CREATED, dependencies=[REQUIRE_SALES_DISPATCH_MANAGE])
def create_dispatch_endpoint(
    payload: SalesDispatchCreateRequest,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesDispatchRead:
    try:
        dispatch = dispatch_service.create_dispatch(
            db,
            tenant_id=tenant_context.current_tenant_id,
            customer_id=payload.customer_id,
            warehouse_id=payload.warehouse_id,
            tank_id=payload.tank_id,
            dispatch_date=payload.dispatch_date,
            notes=payload.notes,
            cylinders_payload=[item.model_dump() for item in payload.cylinders],
            cost_lines=[item.model_dump() for item in payload.cost_lines] if payload.cost_lines else None,
            created_by=tenant_context.current_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesDispatchRead.model_validate(_serialize_dispatch(db, dispatch))


@router.get("/{dispatch_id}", response_model=SalesDispatchRead, dependencies=[REQUIRE_SALES_DISPATCH_READ])
def get_dispatch_endpoint(
    dispatch_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesDispatchRead:
    dispatch = dispatch_service.get_dispatch(db, tenant_id=tenant_context.current_tenant_id, dispatch_id=dispatch_id)
    if dispatch is None:
        raise HTTPException(status_code=404, detail="Salida a cliente no encontrada")
    return SalesDispatchRead.model_validate(_serialize_dispatch(db, dispatch))


@router.post("/{dispatch_id}/confirm", response_model=SalesDispatchRead, dependencies=[REQUIRE_SALES_DISPATCH_MANAGE])
def confirm_dispatch_endpoint(
    dispatch_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesDispatchRead:
    dispatch = dispatch_service.get_dispatch(db, tenant_id=tenant_context.current_tenant_id, dispatch_id=dispatch_id)
    if dispatch is None:
        raise HTTPException(status_code=404, detail="Salida a cliente no encontrada")
    try:
        dispatch = dispatch_service.transition(
            db,
            dispatch=dispatch,
            target="DESPACHADO",
            user_id=tenant_context.current_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesDispatchRead.model_validate(_serialize_dispatch(db, dispatch))


@router.post("/{dispatch_id}/cancel", response_model=SalesDispatchRead, dependencies=[REQUIRE_SALES_DISPATCH_MANAGE])
def cancel_dispatch_endpoint(
    dispatch_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesDispatchRead:
    dispatch = dispatch_service.get_dispatch(db, tenant_id=tenant_context.current_tenant_id, dispatch_id=dispatch_id)
    if dispatch is None:
        raise HTTPException(status_code=404, detail="Salida a cliente no encontrada")
    try:
        dispatch = dispatch_service.transition(
            db,
            dispatch=dispatch,
            target="CANCELADO",
            user_id=tenant_context.current_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesDispatchRead.model_validate(_serialize_dispatch(db, dispatch))
