from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from plugins.pos.backend.common import audit_pos_action, emit_pos_event, PosActionContext
from plugins.pos.backend.schemas import QuickProductRequest, QuickProductRead
from plugins.productos.backend.common import ProductosActionContext
from plugins.productos.backend.models import Product, ProductLine, ProductUnit
from plugins.productos.backend.schemas import (
    ProductBarcodeCreateRequest,
    ProductCreateRequest,
    ProductLineCreateRequest,
    ProductPriceCreateRequest,
    ProductUnitCreateRequest,
)
from plugins.productos.backend.services.barcode import create_barcode
from plugins.productos.backend.services.catalog import create_line, create_unit
from plugins.productos.backend.services.pricing import create_price
from plugins.productos.backend.services.products import create_product
from plugins.stock.backend.common import StockActionContext
from plugins.stock.backend.services.movements import purchase_in_stock

DEFAULT_UNIT_CODE = "UND"
DEFAULT_LINE_CODE = "GENERAL"
UNIT_PRICE_LIST = "UNITARIO"
CURRENCY = "PEN"


def _resolve_unit_id(
    db: Session, *, tenant_id: str, action_context: ProductosActionContext
) -> str:
    unit = db.scalar(
        select(ProductUnit).where(
            ProductUnit.tenant_id == tenant_id, ProductUnit.code == DEFAULT_UNIT_CODE
        )
    )
    if unit is not None:
        return unit.id
    existing = db.scalar(
        select(ProductUnit)
        .where(ProductUnit.tenant_id == tenant_id)
        .order_by(ProductUnit.created_at.asc())
        .limit(1)
    )
    if existing is not None:
        return existing.id
    created = create_unit(
        db,
        tenant_id=tenant_id,
        payload=ProductUnitCreateRequest(code=DEFAULT_UNIT_CODE, name="Unidad", equivalencia=1),
        action_context=action_context,
    )
    return created.id


def _resolve_line_id(
    db: Session, *, tenant_id: str, action_context: ProductosActionContext
) -> str:
    line = db.scalar(
        select(ProductLine).where(
            ProductLine.tenant_id == tenant_id, ProductLine.code == DEFAULT_LINE_CODE
        )
    )
    if line is not None:
        return line.id
    existing = db.scalar(
        select(ProductLine)
        .where(ProductLine.tenant_id == tenant_id)
        .order_by(ProductLine.created_at.asc())
        .limit(1)
    )
    if existing is not None:
        return existing.id
    created = create_line(
        db,
        tenant_id=tenant_id,
        payload=ProductLineCreateRequest(code=DEFAULT_LINE_CODE, name="General"),
        action_context=action_context,
    )
    return created.id


def _generate_unique_sku(db: Session, *, tenant_id: str) -> str:
    for _ in range(5):
        sku = f"POS-{uuid4().hex[:8].upper()}"
        existing = db.scalar(
            select(Product.id).where(Product.tenant_id == tenant_id, Product.sku == sku)
        )
        if existing is None:
            return sku
    raise ValueError("No se pudo generar un SKU único para el producto rápido")


def create_quick_product(
    db: Session,
    *,
    tenant_id: str,
    actor_user_id: str,
    payload: QuickProductRequest,
    warehouse_id: str,
    action_context: PosActionContext,
    productos_context: ProductosActionContext,
    stock_context: StockActionContext,
) -> QuickProductRead:
    unit_id = payload.unit_id or _resolve_unit_id(
        db, tenant_id=tenant_id, action_context=productos_context
    )
    line_id = payload.line_id or _resolve_line_id(
        db, tenant_id=tenant_id, action_context=productos_context
    )
    sku = payload.sku or _generate_unique_sku(db, tenant_id=tenant_id)

    product = create_product(
        db,
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        payload=ProductCreateRequest(
            sku=sku,
            name=payload.name,
            description=payload.description,
            line_id=line_id,
            unit_id=unit_id,
            weight_kg=payload.weight_kg,
        ),
        action_context=productos_context,
    )

    create_price(
        db,
        product=product,
        actor_user_id=actor_user_id,
        payload=ProductPriceCreateRequest(
            price_list=UNIT_PRICE_LIST,
            amount=payload.sale_price,
            currency=CURRENCY,
        ),
        action_context=productos_context,
    )

    barcode: str | None = None
    if payload.barcode:
        created_barcode = create_barcode(
            db,
            product=product,
            payload=ProductBarcodeCreateRequest(
                barcode_type=payload.barcode_type,
                barcode=payload.barcode,
                is_primary=True,
            ),
            action_context=productos_context,
        )
        barcode = created_barcode.barcode

    if payload.initial_stock > 0:
        purchase_in_stock(
            db,
            tenant_id=tenant_id,
            product_id=product.id,
            warehouse_id=warehouse_id,
            quantity=payload.initial_stock,
            unit_cost=payload.unit_cost,
            reference_type="pos_quick_product",
            reference_id=product.id,
            idempotency_key=f"pos-quick-product:{product.id}",
            action_context=stock_context,
        )

    audit_pos_action(
        db,
        context=action_context,
        action="product.quick_create",
        entity_type="product",
        entity_id=product.id,
        details={"sku": product.sku, "sale_price": payload.sale_price, "barcode": barcode},
    )
    emit_pos_event(
        db,
        context=action_context,
        event_name="pos.product.quick_created",
        entity_type="product",
        entity_id=product.id,
        payload={"product_id": product.id, "sku": product.sku, "sale_price": payload.sale_price},
    )

    return QuickProductRead(
        id=product.id,
        sku=product.sku,
        name=product.name,
        sale_price=round(float(payload.sale_price), 2),
        barcode=barcode,
        initial_stock=float(payload.initial_stock),
    )
