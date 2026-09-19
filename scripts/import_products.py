#!/usr/bin/env python3
"""Import product seed CSV into PostgreSQL with barcode UPSERT."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from pathlib import Path


UPSERT_SQL = """
INSERT INTO products (
    barcode, name, brand, quantity, category, category_normalized,
    image_url, countries, source, metadata
) VALUES (
    %(barcode)s, %(name)s, %(brand)s, %(quantity)s, %(category)s, %(category_normalized)s,
    %(image_url)s, %(countries)s, %(source)s, %(metadata)s::jsonb
)
ON CONFLICT (barcode) DO UPDATE SET
    name = EXCLUDED.name,
    brand = EXCLUDED.brand,
    quantity = EXCLUDED.quantity,
    category = EXCLUDED.category,
    category_normalized = EXCLUDED.category_normalized,
    image_url = EXCLUDED.image_url,
    countries = EXCLUDED.countries,
    source = EXCLUDED.source,
    metadata = EXCLUDED.metadata,
    updated_at = now();
"""


def empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def iter_rows(path: Path):
    with path.open("r", encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            metadata = row.get("metadata") or "{}"
            json.loads(metadata)
            yield {
                "barcode": empty_to_none(row.get("barcode")),
                "name": empty_to_none(row.get("name")),
                "brand": empty_to_none(row.get("brand")),
                "quantity": empty_to_none(row.get("quantity")),
                "category": empty_to_none(row.get("category")),
                "category_normalized": empty_to_none(row.get("category_normalized")),
                "image_url": empty_to_none(row.get("image_url")),
                "countries": empty_to_none(row.get("countries")),
                "source": empty_to_none(row.get("source")) or "open_food_facts",
                "metadata": metadata,
            }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import product CSV into PostgreSQL")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--batch-size", type=int, default=500)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.database_url:
        print("Missing --database-url or DATABASE_URL", file=sys.stderr)
        return 2

    try:
        import psycopg
    except ImportError:
        print("Missing dependency: install psycopg with `python3 -m pip install psycopg[binary]`", file=sys.stderr)
        return 2

    count = 0
    with psycopg.connect(args.database_url) as conn:
        with conn.cursor() as cur:
            batch = []
            for row in iter_rows(args.input):
                batch.append(row)
                if len(batch) >= args.batch_size:
                    cur.executemany(UPSERT_SQL, batch)
                    count += len(batch)
                    batch.clear()
            if batch:
                cur.executemany(UPSERT_SQL, batch)
                count += len(batch)
        conn.commit()
    print(f"Imported {count} products")
    return 0


if __name__ == "__main__":
    sys.exit(main())
