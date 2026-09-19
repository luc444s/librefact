#!/usr/bin/env python3
"""Import the Open Food Facts Peru seed CSV into Librefact product tables.

This is the minimal practical import: products, barcodes, brands, categories,
lines, unit, and images. OFF metadata is intentionally ignored.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4


DEFAULT_DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/librefact"
CATEGORY_CODES = {
    "Bebidas": "BEBIDAS",
    "Lácteos": "LACTEOS",
    "Abarrotes": "ABARROTES",
    "Galletas": "GALLETAS",
    "Snacks": "SNACKS",
    "Golosinas": "GOLOSINAS",
    "Conservas": "CONSERVAS",
    "Desayuno": "DESAYUNO",
    "Salsas y condimentos": "SALSAS",
    "Limpieza": "LIMPIEZA",
    "Higiene": "HIGIENE",
    "Panificados": "PANIFICADOS",
    "Otros": "OTROS",
}


@dataclass
class Stats:
    rows_read: int = 0
    rows_skipped: int = 0
    products_created: int = 0
    products_existing_skipped: int = 0
    products_updated: int = 0
    brands_created: int = 0
    categories_created: int = 0
    lines_created: int = 0
    barcodes_created: int = 0
    images_created: int = 0
    errors: int = 0


def clean_text(value: str | None, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    value = unicodedata.normalize("NFC", value).strip()
    value = re.sub(r"\s+", " ", value)
    if not value:
        return None
    if max_length is not None:
        value = value[:max_length]
    return value


def db_url_for_psycopg(url: str) -> str:
    return url.replace("postgresql+psycopg://", "postgresql://", 1)


def slug_code(value: str, *, max_length: int = 20, fallback: str = "ITEM") -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").upper()
    return (value or fallback)[:max_length]


def first_brand(value: str | None) -> str | None:
    if not value:
        return None
    return clean_text(value.split(",")[0], 100)


def country_code(countries: str | None) -> str | None:
    if countries and "peru" in unicodedata.normalize("NFKD", countries).encode("ascii", "ignore").decode("ascii").lower():
        return "PE"
    return None


def parse_weight_kg(quantity: str | None) -> float | None:
    """Infer package weight only from explicit gram/kilogram quantities."""
    if not quantity:
        return None
    text = unicodedata.normalize("NFKD", quantity).encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace(",", ".")
    total = 0.0

    pack_pattern = re.compile(
        r"(?<!\d)(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*"
        r"(kg|kgs|kilogramo?s?|kilo?s?|g|gr|grs|gramo?s?)\b"
    )
    consumed: list[tuple[int, int]] = []
    for match in pack_pattern.finditer(text):
        multiplier = int(match.group(1))
        amount = float(match.group(2))
        unit = match.group(3)
        if multiplier <= 0 or amount <= 0:
            continue
        consumed.append(match.span())
        total += multiplier * (amount if unit.startswith("k") else amount / 1000.0)

    def was_consumed(start: int, end: int) -> bool:
        return any(start >= span_start and end <= span_end for span_start, span_end in consumed)

    single_pattern = re.compile(
        r"(?<!\d)(\d+(?:\.\d+)?)\s*(kg|kgs|kilogramo?s?|kilo?s?|g|gr|grs|gramo?s?)\b"
    )
    for match in single_pattern.finditer(text):
        if was_consumed(*match.span()):
            continue
        raw_amount, unit = match.groups()
        amount = float(raw_amount)
        if amount <= 0:
            continue
        if unit.startswith("k"):
            total += amount
        else:
            total += amount / 1000.0
    if total <= 0:
        return None
    return round(total, 3)


def require_table(cur: Any, table_name: str) -> None:
    cur.execute("SELECT to_regclass(%s)", (table_name,))
    if cur.fetchone()[0] is None:
        raise RuntimeError(f"Missing required table: {table_name}")


def scalar(cur: Any, query: str, params: tuple[Any, ...] | dict[str, Any] = ()) -> Any:
    cur.execute(query, params)
    row = cur.fetchone()
    return row[0] if row else None


def resolve_tenant_and_user(cur: Any, tenant_id: str | None, user_id: str | None) -> tuple[str, str]:
    if tenant_id is None:
        tenant_id = scalar(cur, "SELECT id FROM tenants WHERE slug = 'demo' AND is_active IS TRUE LIMIT 1")
    if tenant_id is None:
        tenant_id = scalar(cur, "SELECT id FROM tenants WHERE is_active IS TRUE ORDER BY created_at LIMIT 1")
    if tenant_id is None:
        raise RuntimeError("No active tenant found. Pass --tenant-id after running core seed/migrations.")

    if user_id is None:
        user_id = scalar(
            cur,
            """
            SELECT id FROM users
            WHERE tenant_id = %s AND is_active IS TRUE
            ORDER BY is_superadmin DESC, created_at
            LIMIT 1
            """,
            (tenant_id,),
        )
    if user_id is None:
        raise RuntimeError("No active user found for tenant. Pass --user-id or seed an admin user.")

    if scalar(cur, "SELECT id FROM tenants WHERE id = %s", (tenant_id,)) is None:
        raise RuntimeError(f"tenant_id not found: {tenant_id}")
    if scalar(cur, "SELECT id FROM users WHERE id = %s AND tenant_id = %s", (user_id, tenant_id)) is None:
        raise RuntimeError(f"user_id not found in tenant: {user_id}")
    return tenant_id, user_id


def get_or_create_unit(cur: Any, tenant_id: str, dry_run: bool) -> str:
    unit_id = scalar(
        cur,
        "SELECT id FROM prod_units WHERE tenant_id = %s AND code = 'UND' LIMIT 1",
        (tenant_id,),
    )
    if unit_id is not None:
        return unit_id
    unit_id = str(uuid4())
    if not dry_run:
        cur.execute(
            """
            INSERT INTO prod_units (id, tenant_id, code, name, equivalencia, is_active, created_at, updated_at)
            VALUES (%s, %s, 'UND', 'Unidad', 1, TRUE, NOW(), NOW())
            """,
            (unit_id, tenant_id),
        )
    return unit_id


def get_or_create_category(cur: Any, tenant_id: str, name: str, dry_run: bool, stats: Stats) -> str:
    code = CATEGORY_CODES.get(name, slug_code(name))
    category_id = scalar(
        cur,
        "SELECT id FROM prod_categories WHERE tenant_id = %s AND code = %s LIMIT 1",
        (tenant_id, code),
    )
    if category_id is not None:
        return category_id
    category_id = str(uuid4())
    stats.categories_created += 1
    if not dry_run:
        cur.execute(
            """
            INSERT INTO prod_categories (id, tenant_id, code, name, is_active, created_at, updated_at)
            VALUES (%s, %s, %s, %s, TRUE, NOW(), NOW())
            """,
            (category_id, tenant_id, code, name),
        )
    return category_id


def get_or_create_line(
    cur: Any,
    tenant_id: str,
    name: str,
    category_id: str,
    dry_run: bool,
    stats: Stats,
) -> str:
    code = CATEGORY_CODES.get(name, slug_code(name))
    line_id = scalar(
        cur,
        "SELECT id FROM prod_lines WHERE tenant_id = %s AND code = %s LIMIT 1",
        (tenant_id, code),
    )
    if line_id is not None:
        return line_id
    line_id = str(uuid4())
    stats.lines_created += 1
    if not dry_run:
        cur.execute(
            """
            INSERT INTO prod_lines (id, tenant_id, code, name, category_id, is_active, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, TRUE, NOW(), NOW())
            """,
            (line_id, tenant_id, code, name, category_id),
        )
    return line_id


def get_or_create_brand(
    cur: Any,
    tenant_id: str,
    name: str | None,
    dry_run: bool,
    stats: Stats,
    brand_cache: dict[str, str],
) -> str | None:
    if not name:
        return None
    cache_key = name.lower()
    if cache_key in brand_cache:
        return brand_cache[cache_key]

    existing = scalar(
        cur,
        "SELECT id FROM prod_brands WHERE tenant_id = %s AND lower(name) = lower(%s) LIMIT 1",
        (tenant_id, name),
    )
    if existing is not None:
        brand_cache[cache_key] = existing
        return existing

    base_code = slug_code(name)
    code = base_code
    suffix = 2
    while scalar(cur, "SELECT id FROM prod_brands WHERE tenant_id = %s AND code = %s", (tenant_id, code)):
        suffix_text = str(suffix)
        code = f"{base_code[:20 - len(suffix_text)]}{suffix_text}"
        suffix += 1

    brand_id = str(uuid4())
    stats.brands_created += 1
    if not dry_run:
        cur.execute(
            """
            INSERT INTO prod_brands (id, tenant_id, code, name, is_active, created_at, updated_at)
            VALUES (%s, %s, %s, %s, TRUE, NOW(), NOW())
            """,
            (brand_id, tenant_id, code, name),
        )
    brand_cache[cache_key] = brand_id
    return brand_id


def import_row(
    cur: Any,
    row: dict[str, str],
    *,
    tenant_id: str,
    user_id: str,
    unit_id: str,
    dry_run: bool,
    update_existing: bool,
    stats: Stats,
    category_cache: dict[str, str],
    line_cache: dict[str, str],
    brand_cache: dict[str, str],
) -> None:
    barcode = clean_text(row.get("barcode"), 150)
    name = clean_text(row.get("name"), 200)
    if not barcode or not name:
        stats.rows_skipped += 1
        return

    existing_product_id = scalar(
        cur,
        """
        SELECT product_id FROM prod_barcodes
        WHERE tenant_id = %s AND barcode_type = 'EAN' AND barcode = %s
        LIMIT 1
        """,
        (tenant_id, barcode),
    )
    if existing_product_id is not None:
        if update_existing:
            brand_id = get_or_create_brand(
                cur, tenant_id, first_brand(row.get("brand")), dry_run, stats, brand_cache
            )
            short_description = clean_text(row.get("quantity"), 500)
            image_url = clean_text(row.get("image_url"), 500)
            weight_kg = parse_weight_kg(row.get("quantity"))
            if not dry_run:
                cur.execute(
                    """
                    UPDATE prod_products
                    SET name = COALESCE(NULLIF(name, ''), %s),
                        short_description = COALESCE(short_description, %s),
                        brand_id = COALESCE(brand_id, %s),
                        weight_kg = COALESCE(weight_kg, %s),
                        country_code = COALESCE(country_code, %s),
                        updated_at = NOW()
                    WHERE id = %s AND tenant_id = %s
                    """,
                    (
                        name,
                        short_description,
                        brand_id,
                        weight_kg,
                        country_code(row.get("countries")),
                        existing_product_id,
                        tenant_id,
                    ),
                )
                maybe_create_image(cur, tenant_id, existing_product_id, image_url, dry_run, stats)
            stats.products_updated += 1
        else:
            stats.products_existing_skipped += 1
        return

    category_name = clean_text(row.get("category_normalized"), 100) or "Otros"
    if category_name not in category_cache:
        category_cache[category_name] = get_or_create_category(
            cur, tenant_id, category_name, dry_run, stats
        )
    if category_name not in line_cache:
        line_cache[category_name] = get_or_create_line(
            cur, tenant_id, category_name, category_cache[category_name], dry_run, stats
        )

    brand_id = get_or_create_brand(cur, tenant_id, first_brand(row.get("brand")), dry_run, stats, brand_cache)
    product_id = str(uuid4())
    if not dry_run:
        cur.execute(
            """
            INSERT INTO prod_products (
                id, tenant_id, sku, name, short_description, line_id, brand_id, unit_id,
                status_code, condition_code, country_code, is_service, is_active,
                weight_kg, created_by, created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s,
                'ACTIVO', 'PRODUCTO', %s, FALSE, TRUE,
                %s, %s, NOW(), NOW()
            )
            """,
            (
                product_id,
                tenant_id,
                barcode[:30],
                name,
                clean_text(row.get("quantity"), 500),
                line_cache[category_name],
                brand_id,
                unit_id,
                country_code(row.get("countries")),
                parse_weight_kg(row.get("quantity")),
                user_id,
            ),
        )
        cur.execute(
            """
            INSERT INTO prod_barcodes (
                id, tenant_id, product_id, barcode_type, barcode, is_primary, is_active,
                created_at, updated_at
            ) VALUES (%s, %s, %s, 'EAN', %s, TRUE, TRUE, NOW(), NOW())
            """,
            (str(uuid4()), tenant_id, product_id, barcode),
        )
    stats.products_created += 1
    stats.barcodes_created += 1
    maybe_create_image(cur, tenant_id, product_id, clean_text(row.get("image_url"), 500), dry_run, stats)


def maybe_create_image(
    cur: Any,
    tenant_id: str,
    product_id: str,
    image_url: str | None,
    dry_run: bool,
    stats: Stats,
) -> None:
    if not image_url:
        return
    exists = scalar(
        cur,
        "SELECT id FROM prod_media WHERE tenant_id = %s AND product_id = %s AND url = %s LIMIT 1",
        (tenant_id, product_id, image_url),
    )
    if exists is not None:
        return
    stats.images_created += 1
    if not dry_run:
        cur.execute(
            """
            INSERT INTO prod_media (id, tenant_id, product_id, media_type, url, is_primary, created_at)
            VALUES (%s, %s, %s, 'image', %s, TRUE, NOW())
            """,
            (str(uuid4()), tenant_id, product_id, image_url),
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import OFF Peru products into Librefact prod_* tables")
    parser.add_argument("--input", type=Path, default=Path("data/productos_peru.csv"))
    parser.add_argument("--database-url", default=os.environ.get("SYSTUTOR_DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--tenant-id")
    parser.add_argument("--user-id")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--update-existing", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        import psycopg
    except ImportError:
        print("Missing dependency: psycopg", file=sys.stderr)
        return 2

    stats = Stats()
    category_cache: dict[str, str] = {}
    line_cache: dict[str, str] = {}
    brand_cache: dict[str, str] = {}

    with psycopg.connect(db_url_for_psycopg(args.database_url)) as conn:
        with conn.cursor() as cur:
            for table in [
                "tenants",
                "users",
                "prod_products",
                "prod_barcodes",
                "prod_brands",
                "prod_categories",
                "prod_lines",
                "prod_units",
                "prod_media",
            ]:
                require_table(cur, table)
            tenant_id, user_id = resolve_tenant_and_user(cur, args.tenant_id, args.user_id)
            unit_id = get_or_create_unit(cur, tenant_id, args.dry_run)

            with args.input.open("r", encoding="utf-8", newline="") as file:
                for row in csv.DictReader(file):
                    if args.limit and stats.rows_read >= args.limit:
                        break
                    stats.rows_read += 1
                    try:
                        import_row(
                            cur,
                            row,
                            tenant_id=tenant_id,
                            user_id=user_id,
                            unit_id=unit_id,
                            dry_run=args.dry_run,
                            update_existing=args.update_existing,
                            stats=stats,
                            category_cache=category_cache,
                            line_cache=line_cache,
                            brand_cache=brand_cache,
                        )
                    except Exception as exc:
                        stats.errors += 1
                        print(f"row {stats.rows_read}: {exc}", file=sys.stderr)
                        if stats.errors >= 10:
                            raise
            if args.dry_run:
                conn.rollback()
            else:
                conn.commit()

    print(f"tenant_id={tenant_id}")
    print(f"user_id={user_id}")
    for key, value in stats.__dict__.items():
        print(f"{key}={value}")
    return 0 if stats.errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
