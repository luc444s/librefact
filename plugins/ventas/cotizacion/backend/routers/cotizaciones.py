from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from systutor.api.deps import get_db_session
from systutor.kernel.auth.dependencies import (
    get_current_tenant_context,
    get_current_user,
    require_permission,
)
from systutor.kernel.tenants.context import TenantContext

from plugins.ventas.cotizacion.backend.models import QuoteDraft
from plugins.ventas.cotizacion.backend.services.cotizacion import (
    confirm_cotizacion,
    convert_cotizacion,
    create_cotizacion,
    get_cotizacion,
    list_cotizaciones,
)

router = APIRouter(prefix="/cotizaciones", tags=["ventas"])
DB_SESSION = Depends(get_db_session)
TENANT_CONTEXT = Depends(get_current_tenant_context)
REQUIRE_QUOTE_READ = Depends(require_permission("ventas.quote.read"))
REQUIRE_QUOTE_MANAGE = Depends(require_permission("ventas.quote.manage"))


class QuoteStatusPatchRequest(BaseModel):
    status: str = Field(min_length=1)


class QuoteItemCreateRequest(BaseModel):
    product_id: str = Field(..., min_length=1)
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., gt=0)
    line_total: float | None = Field(default=None, ge=0)


class QuoteCreateRequest(BaseModel):
    customer_id: str = Field(..., min_length=1)
    valid_until: date | None = Field(default=None)
    notes: str | None = Field(default=None)
    items: list[QuoteItemCreateRequest] = Field(..., min_length=1)


def _serialize_item(item) -> dict:
    return {
        "id": item.id,
        "product_id": item.product_id,
        "product_name": item.product_name,
        "quantity": item.quantity,
        "unit_price": float(item.unit_price) if item.unit_price is not None else None,
        "line_total": float(item.line_total) if item.line_total is not None else None,
        "unit_weight_kg": float(item.unit_weight_kg) if item.unit_weight_kg is not None else None,
    }


def _serialize_quote_list_item(quote: QuoteDraft) -> dict:
    return {
        "id": quote.id,
        "customer_name": quote.customer_name,
        "delivery_date": quote.delivery_date,
        "delivery_time": quote.delivery_time,
        "status": quote.status,
        "vehicle_plate": quote.vehicle_plate,
        "conditions": quote.conditions,
        "notes": quote.notes,
        "quote_number": quote.quote_number,
        "issue_date": quote.issue_date,
        "valid_until": quote.valid_until,
        "currency": quote.currency,
        "customer_contact": quote.customer_contact,
        "customer_document": quote.customer_document,
        "customer_address": quote.customer_address,
        "warehouse_name": quote.warehouse_name,
        "seller_name": quote.seller_name,
        "items_count": len(quote.items),
        "created_at": quote.created_at,
        "updated_at": quote.updated_at,
    }


def _serialize_quote_detail(quote: QuoteDraft) -> dict:
    return {
        "id": quote.id,
        "customer": {"id": quote.customer_id, "name": quote.customer_name},
        "customer_name": quote.customer_name,
        "vehicle": (
            {"id": quote.vehicle_id, "plate": quote.vehicle_plate} if quote.vehicle_id else None
        ),
        "vehicle_plate": quote.vehicle_plate,
        "status": quote.status,
        "delivery_date": quote.delivery_date,
        "delivery_time": quote.delivery_time,
        "conditions": quote.conditions,
        "notes": quote.notes,
        "quote_number": quote.quote_number,
        "issue_date": quote.issue_date,
        "valid_until": quote.valid_until,
        "currency": quote.currency,
        "customer_contact": quote.customer_contact,
        "customer_document": quote.customer_document,
        "customer_address": quote.customer_address,
        "warehouse_name": quote.warehouse_name,
        "seller_name": quote.seller_name,
        "created_by": quote.created_by,
        "updated_by": quote.updated_by,
        "created_at": quote.created_at,
        "updated_at": quote.updated_at,
        "items": [_serialize_item(item) for item in quote.items],
    }


@router.get("", dependencies=[REQUIRE_QUOTE_READ])
def list_quotes(
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    quotes = list_cotizaciones(
        db,
        tenant_id=tenant_context.current_tenant_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
    )
    return [_serialize_quote_list_item(quote) for quote in quotes]


@router.get("/{quote_id}", dependencies=[REQUIRE_QUOTE_READ])
def get_quote(
    quote_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> dict:
    quote = get_cotizacion(db, tenant_id=tenant_context.current_tenant_id, quote_id=quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")
    return _serialize_quote_detail(quote)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[REQUIRE_QUOTE_MANAGE],
    response_model=dict,
)
def create_quote(
    payload: QuoteCreateRequest,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
    current_user: str = Depends(get_current_user),
) -> dict:
    quote = create_cotizacion(
        db,
        tenant_id=tenant_context.current_tenant_id,
        customer_id=payload.customer_id,
        valid_until=payload.valid_until,
        notes=payload.notes,
        items=payload.items,
        user_id=str(current_user.id),
        tenant_context=tenant_context,
    )
    return _serialize_quote_detail(quote)


@router.patch("/{quote_id}/status", dependencies=[REQUIRE_QUOTE_MANAGE])
def patch_quote_status(
    quote_id: str,
    payload: QuoteStatusPatchRequest,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> dict:
    quote = get_cotizacion(db, tenant_id=tenant_context.current_tenant_id, quote_id=quote_id)
    if quote is None:
        raise HTTPException(status_code=404, detail="Cotización no encontrada")

    try:
        if payload.status == "CONFIRMED":
            quote = confirm_cotizacion(db, quote=quote, user_id=tenant_context.current_user_id)
        elif payload.status == "CONVERTED":
            quote = convert_cotizacion(db, quote=quote, user_id=tenant_context.current_user_id)
        else:
            raise ValueError(f"Estado desconocido: {payload.status}")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    db.commit()
    return _serialize_quote_detail(quote)
