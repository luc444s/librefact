from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from systutor.kernel.tenants.context import TenantContext

from plugins.ventas.backend.models import SalesOrder
from plugins.ventas.backend.routers.common import (
    DB_SESSION,
    REQUIRE_ORDER_CREATE,
    REQUIRE_ORDER_DISPATCH,
    REQUIRE_ORDER_MANAGE,
    REQUIRE_ORDER_READ,
    TENANT_CONTEXT,
)
from plugins.ventas.backend.schemas import (
    CancelOrderRequest,
    CloseOrderRequest,
    DispatchOrderRequest,
    SalesOrderCreateRequest,
    SalesOrderDetailRead,
    SalesOrderPageRead,
    SalesOrderRead,
    SalesOrderUpdateRequest,
)
from plugins.ventas.backend.services import orders

router = APIRouter(prefix="/orders", tags=["ventas"])


def _serialize_order(order: SalesOrder) -> dict:
    return {
        "id": order.id,
        "customer": {"id": order.customer_id, "name": order.customer_name}
        if order.customer_id
        else None,
        "customer_name": order.customer_name,
        "status": order.status,
        "order_date": order.order_date,
        "expected_date": order.expected_date,
        "notes": order.notes,
        "created_by": order.created_by,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    }


def _serialize_order_detail(order: SalesOrder) -> dict:
    result: dict = _serialize_order(order)  # type: ignore[assignment]
    result["items"] = [
        {
            "id": item.id,
            "product_id": item.product_id,
            "quantity": float(item.quantity),
            "unit_price": float(item.unit_price),
            "line_total": float(item.line_total),
            "dispatched_qty": float(item.dispatched_qty),
        }
        for item in order.items  # type: ignore[attr-defined]
    ]
    result["events"] = [
        {
            "id": event.id,
            "from_status": event.from_status,
            "to_status": event.to_status,
            "reason": event.reason,
            "user_id": event.user_id,
            "created_at": event.created_at,
        }
        for event in sorted(order.events, key=lambda ev: ev.created_at)  # type: ignore[attr-defined]
    ]
    return result


@router.get("", response_model=SalesOrderPageRead, dependencies=[REQUIRE_ORDER_READ])
def list_orders_endpoint(
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
    status: str | None = None,
    customer_id: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> dict:
    items, total = orders.list_orders(
        db,
        tenant_id=tenant_context.current_tenant_id,
        status=status,
        customer_id=customer_id,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [_serialize_order(item) for item in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", response_model=SalesOrderRead, status_code=status.HTTP_201_CREATED, dependencies=[REQUIRE_ORDER_CREATE])
def create_order_endpoint(
    payload: SalesOrderCreateRequest,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesOrderRead:
    order = orders.create_order(
        db,
        tenant_id=tenant_context.current_tenant_id,
        customer_id=payload.customer_id,
        customer_name=payload.customer_name,
        items_payload=[item.model_dump() for item in payload.items],
        expected_date=payload.expected_date,
        notes=payload.notes,
        created_by=tenant_context.current_user_id,
    )
    db.commit()
    return SalesOrderRead.model_validate(_serialize_order(order))


@router.get("/{order_id}", response_model=SalesOrderDetailRead, dependencies=[REQUIRE_ORDER_READ])
def get_order(
    order_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesOrderDetailRead:
    order = orders.get_order(db, tenant_id=tenant_context.current_tenant_id, order_id=order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return SalesOrderDetailRead.model_validate(_serialize_order_detail(order))


@router.patch("/{order_id}", response_model=SalesOrderRead, dependencies=[REQUIRE_ORDER_MANAGE])
def update_order(
    order_id: str,
    payload: SalesOrderUpdateRequest,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesOrderRead:
    order = orders.get_order(db, tenant_id=tenant_context.current_tenant_id, order_id=order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = orders.update_order(db, order=order, payload=payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesOrderRead.model_validate(_serialize_order(order))


@router.post("/{order_id}/confirm", response_model=SalesOrderRead, dependencies=[REQUIRE_ORDER_MANAGE])
def confirm_order(
    order_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesOrderRead:
    order = orders.get_order(db, tenant_id=tenant_context.current_tenant_id, order_id=order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = orders.confirm_order(db, order=order, user_id=tenant_context.current_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesOrderRead.model_validate(_serialize_order(order))


@router.post("/{order_id}/dispatch", response_model=SalesOrderRead, dependencies=[REQUIRE_ORDER_DISPATCH])
def dispatch_order(
    order_id: str,
    payload: DispatchOrderRequest | None = None,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesOrderRead:
    order = orders.get_order(db, tenant_id=tenant_context.current_tenant_id, order_id=order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = orders.dispatch_order(
            db,
            order=order,
            user_id=tenant_context.current_user_id,
            reason=payload.reason if payload else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesOrderRead.model_validate(_serialize_order(order))


@router.post("/{order_id}/cancel", response_model=SalesOrderRead, dependencies=[REQUIRE_ORDER_MANAGE])
def cancel_order(
    order_id: str,
    payload: CancelOrderRequest | None = None,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesOrderRead:
    order = orders.get_order(db, tenant_id=tenant_context.current_tenant_id, order_id=order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = orders.cancel_order(
            db,
            order=order,
            user_id=tenant_context.current_user_id,
            reason=payload.reason if payload else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesOrderRead.model_validate(_serialize_order(order))


@router.post("/{order_id}/close", response_model=SalesOrderRead, dependencies=[REQUIRE_ORDER_MANAGE])
def close_order(
    order_id: str,
    payload: CloseOrderRequest,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesOrderRead:
    order = orders.get_order(db, tenant_id=tenant_context.current_tenant_id, order_id=order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    try:
        order = orders.close_order(db, order=order, user_id=tenant_context.current_user_id, reason=payload.reason)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesOrderRead.model_validate(_serialize_order(order))
