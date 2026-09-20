from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.orm import Session
from systutor.kernel.tenants.context import TenantContext

from plugins.pos.backend.common import (
    DB_SESSION,
    REQUIRE_SALE_CREATE,
    TENANT_CONTEXT,
    build_action_context,
    resolve_warehouse_id,
)
from plugins.pos.backend.schemas import CheckoutRequest, CheckoutResponse, PosPaymentRead
from plugins.pos.backend.services import checkout as checkout_service
from plugins.pos.backend.services import sessions
from plugins.stock.backend.common import build_action_context as build_stock_action_context

router = APIRouter(tags=["pos"])


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[REQUIRE_SALE_CREATE],
)
def checkout(
    payload: CheckoutRequest,
    request: Request,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> CheckoutResponse:
    if payload.session_id:
        session = sessions.get_session(
            db, tenant_id=tenant_context.current_tenant_id, session_id=payload.session_id
        )
    else:
        try:
            warehouse_id = resolve_warehouse_id(tenant_context)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        session = sessions.get_open_session(
            db, tenant_id=tenant_context.current_tenant_id, warehouse_id=warehouse_id
        )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No hay una caja abierta para cobrar"
        )

    try:
        order, payment = checkout_service.checkout(
            db,
            session=session,
            items_payload=[item.model_dump() for item in payload.items],
            method=payload.method,
            received_amount=payload.received_amount,
            notes=payload.notes,
            user_id=tenant_context.current_user_id,
            action_context=build_action_context(request, tenant_context),
            stock_action_context=build_stock_action_context(request, tenant_context),
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return CheckoutResponse(
        sale=checkout_service.serialize_sale(order),
        payment=PosPaymentRead.model_validate(payment),
    )
