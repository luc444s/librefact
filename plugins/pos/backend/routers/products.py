from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from systutor.kernel.tenants.context import TenantContext

from plugins.pos.backend.common import (
    DB_SESSION,
    REQUIRE_PRODUCT_PRICE,
    REQUIRE_PRODUCT_QUICK,
    REQUIRE_SALE_CREATE,
    TENANT_CONTEXT,
    build_action_context,
    resolve_warehouse_id,
)
from plugins.pos.backend.schemas import (
    PosProductSearchItem,
    QuickProductRead,
    QuickProductRequest,
    SetProductPriceRequest,
    SetProductPriceResponse,
)
from plugins.pos.backend.services import catalog, quick_products
from plugins.productos.backend.common import (
    build_action_context as build_productos_action_context,
)
from plugins.stock.backend.common import build_action_context as build_stock_action_context

router = APIRouter(prefix="/products", tags=["pos"])


@router.get(
    "/search",
    response_model=list[PosProductSearchItem],
    dependencies=[REQUIRE_SALE_CREATE],
)
def search_products(
    q: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> list[PosProductSearchItem]:
    return catalog.search_products_with_price(
        db,
        tenant_id=tenant_context.current_tenant_id,
        query=q or "",
        limit=limit,
    )


@router.post(
    "/{product_id}/price",
    response_model=SetProductPriceResponse,
    dependencies=[REQUIRE_PRODUCT_PRICE],
)
def set_product_price(
    product_id: str,
    payload: SetProductPriceRequest,
    request: Request,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SetProductPriceResponse:
    try:
        result = catalog.set_unit_price(
            db,
            tenant_id=tenant_context.current_tenant_id,
            actor_user_id=tenant_context.current_user_id,
            product_id=product_id,
            amount=payload.amount,
            action_context=build_action_context(request, tenant_context),
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return result


@router.post(
    "/quick",
    response_model=QuickProductRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[REQUIRE_PRODUCT_QUICK],
)
def create_quick_product(
    payload: QuickProductRequest,
    request: Request,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> QuickProductRead:
    try:
        warehouse_id = resolve_warehouse_id(tenant_context)
        result = quick_products.create_quick_product(
            db,
            tenant_id=tenant_context.current_tenant_id,
            actor_user_id=tenant_context.current_user_id,
            payload=payload,
            warehouse_id=warehouse_id,
            action_context=build_action_context(request, tenant_context),
            productos_context=build_productos_action_context(request, tenant_context),
            stock_context=build_stock_action_context(request, tenant_context),
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return result
