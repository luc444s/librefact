from __future__ import annotations

import shlex
import uuid as U
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from systutor.kernel.tenants.context import TenantContext

from plugins.crm.backend.models import CrmCustomer
from plugins.logistics.backend.models.resources import LogisticsWarehouse
from plugins.productos.backend.models import Product
from plugins.ventas.backend.models import SalesOrder, SalesOrderItem
from plugins.ventas.cotizacion.backend.models import QuoteDraft, QuoteItem

VALID_STATUSES = ("DRAFT", "CONFIRMED", "CONVERTED", "CANCELLED")
TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"CONFIRMED", "CANCELLED"},
    "CONFIRMED": {"CONVERTED", "CANCELLED"},
    "CONVERTED": set(),
    "CANCELLED": set(),
}


def _extract_tokens(text: str) -> dict:
    tokens = shlex.split(text)
    dry_run = False
    if tokens and tokens[0].lower() == "preview":
        dry_run = True
        tokens = tokens[1:]
    if tokens and tokens[0].lower() in {"cotizar", "cotiza"}:
        tokens = tokens[1:]

    cliente_raw = ""
    vehiculo_raw = None
    fecha_raw = None
    hora_raw = None
    items_raw: list[dict[str, object]] = []

    i = 0
    while i < len(tokens):
        token = tokens[i]
        low = token.lower()
        if low == "cliente" and i + 1 < len(tokens):
            cliente_raw = tokens[i + 1]
            i += 2
            continue
        if low == "vehiculo" and i + 1 < len(tokens):
            vehiculo_raw = tokens[i + 1]
            i += 2
            continue
        if token.isdigit() and i + 1 < len(tokens):
            items_raw.append({"cantidad": int(token), "producto": tokens[i + 1]})
            i += 2
            continue
        if ":" in token and hora_raw is None:
            hora_raw = token
            i += 1
            continue
        if low in {"hoy", "mañana"} and fecha_raw is None:
            fecha_raw = token
            i += 1
            continue
        if fecha_raw is None:
            fecha_raw = token
        i += 1

    return {
        "dry_run": dry_run,
        "cliente_raw": cliente_raw,
        "items_raw": items_raw,
        "fecha_raw": fecha_raw,
        "hora_raw": hora_raw,
        "vehiculo_raw": vehiculo_raw,
    }


def _validate_status_transition(current: str, target: str) -> None:
    if target not in VALID_STATUSES:
        raise ValueError(f"Estado desconocido: {target}")
    if target not in TRANSITIONS.get(current, set()):
        raise ValueError(f"No se puede pasar de {current} a {target}")


def _base_query(tenant_id: str, status: str | None = None, quote_id: str | None = None):
    stmt = (
        select(QuoteDraft)
        .options(selectinload(QuoteDraft.items))
        .where(QuoteDraft.tenant_id == tenant_id)
    )
    if status:
        stmt = stmt.where(QuoteDraft.status == status)
    if quote_id:
        stmt = stmt.where(QuoteDraft.id == quote_id)
    return stmt.order_by(QuoteDraft.delivery_date.desc(), QuoteDraft.created_at.desc())


def list_cotizaciones(
    db: Session,
    *,
    tenant_id: str,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[QuoteDraft]:
    stmt = _base_query(tenant_id, status)
    if date_from is not None:
        stmt = stmt.where(QuoteDraft.delivery_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(QuoteDraft.delivery_date <= date_to)
    return list(db.scalars(stmt).all())


def get_cotizacion(db: Session, *, tenant_id: str, quote_id: str) -> QuoteDraft | None:
    return db.scalar(_base_query(tenant_id, quote_id=quote_id))


def transition(
    db: Session,
    *,
    quote: QuoteDraft,
    target: str,
    user_id: str | None = None,
) -> QuoteDraft:
    _validate_status_transition(quote.status, target)
    quote.status = target
    quote.updated_by = user_id
    db.add(quote)
    db.flush()
    return quote


def confirm_cotizacion(db: Session, *, quote: QuoteDraft, user_id: str | None = None) -> QuoteDraft:
    return transition(db, quote=quote, target="CONFIRMED", user_id=user_id)


def convert_cotizacion(db: Session, *, quote: QuoteDraft, user_id: str | None = None) -> QuoteDraft:
    _validate_status_transition(quote.status, "CONVERTED")
    if not quote.items:
        raise ValueError("No se puede convertir una cotización sin items")

    existing_order = db.scalar(
        select(SalesOrder).where(
            SalesOrder.tenant_id == quote.tenant_id,
            SalesOrder.source_quote_id == quote.id,
        )
    )
    if existing_order is not None:
        raise ValueError("La cotización ya fue convertida en pedido")

    order = SalesOrder(
        tenant_id=quote.tenant_id,
        customer_id=quote.customer_id,
        customer_name=quote.customer_name,
        status="DRAFT",
        order_date=date.today(),
        expected_date=quote.delivery_date,
        notes=quote.notes,
        created_by=user_id or quote.created_by,
        source_quote_id=quote.id,
    )
    db.add(order)
    db.flush()

    for item in quote.items:
        if item.unit_price is None or item.line_total is None:
            raise ValueError("No se puede convertir un item sin precio")
        db.add(
            SalesOrderItem(
                order_id=order.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
                dispatched_qty=0,
            )
        )

    quote.status = "CONVERTED"
    quote.updated_by = user_id
    db.add(quote)
    db.flush()
    return quote


def create_cotizacion(
    db: Session,
    *,
    tenant_id: str,
    customer_id: str,
    valid_until: date | None = None,
    notes: str | None = None,
    items: list[dict],
    user_id: str,
    tenant_context: TenantContext,
) -> QuoteDraft:
    if not items or len(items) == 0:
        raise HTTPException(status_code=422, detail="Debe incluir al menos un item")

    cliente_stmt = (
        select(CrmCustomer)
        .where(CrmCustomer.id == customer_id)
        .where(CrmCustomer.tenant_id == tenant_id)
    )
    cliente = db.scalar(cliente_stmt)
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    customer_name = cliente.legal_name or cliente.commercial_name or ""
    customer_contact = cliente.mobile or cliente.phone or None
    customer_document = cliente.document_number or None
    customer_address = None
    if cliente.fiscal_address_id:
        fiscal_addresses = [a for a in cliente.addresses if a.customer_id == cliente.id]
        primary_address = next((a for a in fiscal_addresses if a.address_type == "BILLING"), None)
        customer_address = primary_address.line1 if primary_address else None

    warehouse_name = None
    if tenant_context.current_warehouse_ids:
        warehouse_stmt = (
            select(LogisticsWarehouse.name)
            .where(LogisticsWarehouse.id.in_(tenant_context.current_warehouse_ids))
            .where(LogisticsWarehouse.tenant_id == tenant_id)
        )
        warehouses = db.scalars(warehouse_stmt).all()
        primary_warehouse = next((w for w in warehouses if w.is_primary), None)
        warehouse_name = (
            primary_warehouse.name
            if primary_warehouse
            else warehouses[0].name
            if warehouses
            else None
        )
    else:
        # Fallback: obtener el warehouse primary del tenant
        warehouse_stmt = (
            select(LogisticsWarehouse.name)
            .where(LogisticsWarehouse.tenant_id == tenant_id)
            .where(LogisticsWarehouse.is_primary.is_(True))
            .limit(1)
        )
        warehouse_name = db.scalar(warehouse_stmt)

    max_stmt = (
        select(QuoteDraft.quote_number)
        .where(QuoteDraft.tenant_id == tenant_id)
        .where(QuoteDraft.quote_number.isnot(None))
        .order_by(QuoteDraft.quote_number.desc())
        .limit(1)
    )
    max_quote = db.scalar(max_stmt)
    quote_number = max_quote + 1 if max_quote is not None else 1

    issue_date = date.today()
    if valid_until is None:
        valid_until = issue_date + timedelta(days=15)

    new_quote = QuoteDraft(
        id=str(U.uuid4()),
        tenant_id=tenant_id,
        customer_id=customer_id,
        customer_name=customer_name,
        customer_contact=customer_contact,
        customer_document=customer_document,
        customer_address=customer_address,
        warehouse_name=warehouse_name,
        seller_name=str(user_id),
        quote_number=quote_number,
        issue_date=issue_date,
        valid_until=valid_until,
        currency="PEN",
        status="DRAFT",
        notes=notes,
        created_by=user_id,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(new_quote)
    db.flush()

    for item_data in items:
        product_id = item_data.model_dump()["product_id"]
        quantity = item_data.model_dump()["quantity"]
        unit_price = item_data.model_dump()["unit_price"]
        line_total = item_data.model_dump().get("line_total")

        product_stmt = (
            select(Product.name)
            .where(Product.id == product_id)
            .where(Product.tenant_id == tenant_id)
        )
        product_name = db.scalar(product_stmt)
        if product_name is None:
            raise HTTPException(status_code=404, detail=f"Producto {product_id} no encontrado")

        if line_total is None:
            line_total = round(quantity * unit_price, 2)

        new_item = QuoteItem(
            id=str(U.uuid4()),
            quote_draft_id=new_quote.id,
            product_id=product_id,
            product_name=product_name,
            quantity=quantity,
            unit_price=unit_price,
            line_total=line_total,
            created_at=datetime.now(UTC),
        )
        db.add(new_item)

    db.commit()
    return new_quote
