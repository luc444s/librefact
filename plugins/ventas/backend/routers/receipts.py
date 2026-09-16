from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session
from systutor.kernel.tenants.context import TenantContext

from plugins.ventas.backend.models import SalesReceipt
from plugins.ventas.backend.routers.common import (
    DB_SESSION,
    REQUIRE_SALES_RECEIPT_MANAGE,
    REQUIRE_SALES_RECEIPT_READ,
    TENANT_CONTEXT,
)
from plugins.ventas.backend.schemas import SalesReceiptCreateRequest, SalesReceiptPageRead, SalesReceiptRead
from plugins.ventas.backend.services import receipts as receipt_service

router = APIRouter(prefix="/ingresos-desde-cliente", tags=["ventas"])


def _serialize_receipt(receipt: SalesReceipt) -> dict:
    return {
        "id": receipt.id,
        "customer": {"id": receipt.customer_id, "name": receipt.customer_name} if receipt.customer_id else None,
        "customer_name": receipt.customer_name,
        "warehouse_id": receipt.warehouse_id,
        "dispatch_id": receipt.dispatch_id,
        "tank_id": receipt.tank_id,
        "status": receipt.status,
        "receipt_date": receipt.receipt_date,
        "notes": receipt.notes,
        "created_by": receipt.created_by,
        "created_at": receipt.created_at,
        "updated_at": receipt.updated_at,
        "items": [
            {
                "id": item.id,
                "cylinder_id": item.cylinder_id,
                "serial": item.serial,
                "product_id": item.product_id,
                "incoming_qty": float(item.incoming_qty),
                "status": item.status,
                "notes": item.notes,
                "confirmed_at": item.confirmed_at,
            }
            for item in receipt.items  # type: ignore[attr-defined]
        ],
        "cost_lines": [
            {
                "id": line.id,
                "cost_type": line.cost_type,
                "amount": float(line.amount),
                "currency": line.currency,
                "notes": line.notes,
            }
            for line in getattr(receipt, "cost_lines", [])
        ],
    }


@router.get("", response_model=SalesReceiptPageRead, dependencies=[REQUIRE_SALES_RECEIPT_READ])
def list_receipts_endpoint(
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
    status: str | None = None,
    customer_id: str | None = None,
    limit: int = 10,
    offset: int = 0,
) -> dict:
    items, total = receipt_service.list_receipts(
        db,
        tenant_id=tenant_context.current_tenant_id,
        status=status,
        customer_id=customer_id,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [_serialize_receipt(item) for item in items],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", response_model=SalesReceiptRead, status_code=status.HTTP_201_CREATED, dependencies=[REQUIRE_SALES_RECEIPT_MANAGE])
def create_receipt_endpoint(
    payload: SalesReceiptCreateRequest,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesReceiptRead:
    try:
        receipt = receipt_service.create_receipt(
            db,
            tenant_id=tenant_context.current_tenant_id,
            customer_id=payload.customer_id,
            warehouse_id=payload.warehouse_id,
            dispatch_id=payload.dispatch_id,
            receipt_date=payload.receipt_date,
            notes=payload.notes,
            cylinders_payload=[item.model_dump() for item in payload.cylinders],
            tank_id=payload.tank_id,
            cost_lines=[item.model_dump() for item in payload.cost_lines] if payload.cost_lines else None,
            created_by=tenant_context.current_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesReceiptRead.model_validate(_serialize_receipt(receipt))


@router.get("/{receipt_id}", response_model=SalesReceiptRead, dependencies=[REQUIRE_SALES_RECEIPT_READ])
def get_receipt_endpoint(
    receipt_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesReceiptRead:
    receipt = receipt_service.get_receipt(
        db, tenant_id=tenant_context.current_tenant_id, receipt_id=receipt_id
    )
    if receipt is None:
        raise HTTPException(status_code=404, detail="Ingreso desde cliente no encontrado")
    return SalesReceiptRead.model_validate(_serialize_receipt(receipt))


@router.post("/{receipt_id}/confirm", response_model=SalesReceiptRead, dependencies=[REQUIRE_SALES_RECEIPT_MANAGE])
def confirm_receipt_endpoint(
    receipt_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesReceiptRead:
    receipt = receipt_service.get_receipt(
        db, tenant_id=tenant_context.current_tenant_id, receipt_id=receipt_id
    )
    if receipt is None:
        raise HTTPException(status_code=404, detail="Ingreso desde cliente no encontrado")
    try:
        receipt = receipt_service.confirm_receipt(
            db,
            receipt=receipt,
            user_id=tenant_context.current_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesReceiptRead.model_validate(_serialize_receipt(receipt))


@router.post("/{receipt_id}/cancel", response_model=SalesReceiptRead, dependencies=[REQUIRE_SALES_RECEIPT_MANAGE])
def cancel_receipt_endpoint(
    receipt_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SalesReceiptRead:
    receipt = receipt_service.get_receipt(
        db, tenant_id=tenant_context.current_tenant_id, receipt_id=receipt_id
    )
    if receipt is None:
        raise HTTPException(status_code=404, detail="Ingreso desde cliente no encontrado")
    try:
        receipt = receipt_service.cancel_receipt(
            db,
            receipt=receipt,
            user_id=tenant_context.current_user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SalesReceiptRead.model_validate(_serialize_receipt(receipt))
