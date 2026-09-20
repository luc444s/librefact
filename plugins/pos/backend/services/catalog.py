from __future__ import annotations

import re

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from plugins.pos.backend.common import (
    PosActionContext,
    audit_pos_action,
    emit_pos_event,
)
from plugins.pos.backend.schemas import (
    PosProductSearchItem,
    SetProductPriceResponse,
)
from plugins.productos.backend.common import ProductosActionContext
from plugins.productos.backend.models import Product
from plugins.productos.backend.schemas import ProductPriceCreateRequest
from plugins.productos.backend.services.pricing import create_price

UNIT_PRICE_LIST = "UNITARIO"
CURRENCY = "PEN"


def _tokenize(query: str) -> list[str]:
    raw_tokens = [token.strip() for token in query.strip().split() if token.strip()]
    tokens = [re.sub(r"^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$", "", token) for token in raw_tokens]
    return [token for token in tokens if token]


def search_products_with_price(
    db: Session,
    *,
    tenant_id: str,
    query: str,
    limit: int = 20,
) -> list[PosProductSearchItem]:
    """Busca productos activos con su precio UNITARIO vigente en una sola consulta.

    El precio se resuelve con un LEFT JOIN a ``prod_prices`` para que los
    productos sin precio vigente devuelvan ``price = null`` sin romper la
    busqueda. El subquery prefiere ``UNITARIO``, luego ``valid_from`` y
    ``created_at`` mas recientes, con ``valid_to`` nulo o futuro.
    """
    safe_limit = max(1, min(int(limit), 50))
    tokens = _tokenize(query)

    params: dict[str, object] = {"tenant_id": tenant_id, "limit": safe_limit}
    where_clauses = ["p.tenant_id = :tenant_id", "p.is_active = TRUE"]

    for index, token in enumerate(tokens):
        params[f"prefix_{index}"] = f"{token}%"
        params[f"spaced_{index}"] = f"% {token}%"
        params[f"contains_{index}"] = f"%{token}%"
        where_clauses.append(
            "("
            f"p.sku ILIKE :prefix_{index} OR p.sku ILIKE :spaced_{index} "
            f"OR p.name ILIKE :prefix_{index} OR p.name ILIKE :spaced_{index} "
            f"OR p.description ILIKE :prefix_{index} OR p.description ILIKE :spaced_{index} "
            "OR EXISTS ("
            "SELECT 1 FROM prod_barcodes b "
            "WHERE b.product_id = p.id AND b.barcode ILIKE :contains_" + str(index) + ")"
            ")"
        )

    where_sql = " AND ".join(where_clauses)
    rows = db.execute(
        text(
            f"""
            SELECT p.id, p.sku, p.name, price.amount AS amount,
                   COALESCE(p.weight_kg, p.default_weight_kg) AS weight_kg
            FROM prod_products p
            LEFT JOIN (
                SELECT DISTINCT ON (pp.product_id) pp.product_id, pp.amount
                FROM prod_prices pp
                WHERE pp.tenant_id = :tenant_id
                  AND (pp.valid_to IS NULL OR pp.valid_to >= CURRENT_DATE)
                ORDER BY pp.product_id,
                         CASE WHEN pp.price_list = 'UNITARIO' THEN 0 ELSE 1 END,
                         pp.valid_from DESC,
                         pp.created_at DESC
            ) price ON price.product_id = p.id
            WHERE {where_sql}
            ORDER BY p.name ASC
            LIMIT :limit
            """
        ),
        params,
    ).all()

    return [
        PosProductSearchItem(
            id=row.id,
            sku=row.sku,
            name=row.name,
            price=round(float(row.amount), 2) if row.amount is not None else None,
            weight_kg=round(float(row.weight_kg), 3) if row.weight_kg is not None else None,
        )
        for row in rows
    ]


def set_unit_price(
    db: Session,
    *,
    tenant_id: str,
    actor_user_id: str,
    product_id: str,
    amount: float,
    action_context: PosActionContext,
) -> SetProductPriceResponse:
    """Persiste un precio UNITARIO PEN para un producto del tenant desde el POS."""
    product = db.scalar(
        select(Product).where(Product.id == product_id, Product.tenant_id == tenant_id)
    )
    if product is None:
        raise ValueError("Producto no encontrado")

    productos_context = ProductosActionContext(
        tenant_id=action_context.tenant_id,
        branch_id=action_context.branch_id,
        actor_user_id=action_context.actor_user_id,
        correlation_id=action_context.correlation_id,
        request_id=action_context.request_id,
    )
    price = create_price(
        db,
        product=product,
        actor_user_id=actor_user_id,
        payload=ProductPriceCreateRequest(
            price_list=UNIT_PRICE_LIST,
            amount=amount,
            currency=CURRENCY,
        ),
        action_context=productos_context,
    )

    rounded = round(float(price.amount), 2)
    audit_pos_action(
        db,
        context=action_context,
        action="product.price_set",
        entity_type="product",
        entity_id=product.id,
        details={"product_id": product.id, "price_list": UNIT_PRICE_LIST, "amount": rounded},
    )
    emit_pos_event(
        db,
        context=action_context,
        event_name="pos.product.price_set",
        entity_type="product",
        entity_id=product.id,
        payload={"product_id": product.id, "price": rounded, "price_list": UNIT_PRICE_LIST},
    )

    return SetProductPriceResponse(product_id=product.id, price=rounded)
