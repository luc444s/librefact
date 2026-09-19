#!/usr/bin/env python3
"""Build a Peru convenience-store product seed dataset from Open Food Facts.

Default source is the official compressed CSV export, streamed row by row so the
global file is never loaded into memory. The API is intentionally not used for
bulk extraction because OFF currently asks bulk/caching users to use exports.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import random
import re
import sys
import unicodedata
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


OFF_CSV_URL = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
SOURCE = "open_food_facts"
USER_AGENT = "librefact-product-dataset/1.0 (local dataset build)"

field_limit = sys.maxsize
while True:
    try:
        csv.field_size_limit(field_limit)
        break
    except OverflowError:
        field_limit //= 10

CSV_COLUMNS = [
    "barcode",
    "name",
    "brand",
    "quantity",
    "category",
    "category_normalized",
    "image_url",
    "countries",
    "source",
    "metadata",
]

METADATA_FIELDS = [
    "generic_name",
    "serving_size",
    "categories_tags",
    "countries_tags",
    "image_front_url",
    "ingredients_text",
    "packaging",
    "stores",
    "labels",
    "manufacturer",
]

CATEGORY_RULES = [
    ("Limpieza", ["clean", "detergent", "dishwashing", "laundry", "limpieza", "detergente", "lavavajilla", "lejia", "bleach", "disinfect"]),
    ("Higiene", ["hygiene", "personal care", "shampoo", "soap", "jabon", "toothpaste", "pasta dental", "desodorante", "deodorant"]),
    ("Conservas", ["canned", "preserve", "tuna", "sardine", "conserva", "atun", "atún", "sardina"]),
    ("Galletas", ["biscuit", "cookie", "cracker", "galleta", "galletas"]),
    ("Snacks", ["snack", "chips", "crisps", "popcorn", "nachos", "piqueo", "papas fritas"]),
    ("Golosinas", ["candy", "sweet", "chocolate", "confection", "caramel", "caramelo", "golosina", "chocolat", "alfajor", "jam", "mermelada"]),
    ("Bebidas", ["beverage", "drink", "water", "waters", "juice", "soda", "soft drink", "energy drink", "liqueur", "beer", "wine", "bebida", "agua", "jugo", "zumo", "gaseosa", "energ", "licor", "cerveza", "vino"]),
    ("Lácteos", ["dairy", "milk", "yogurt", "yoghurt", "cheese", "leche", "yogur", "queso", "lacteo", "lácteo"]),
    ("Desayuno", ["breakfast", "cereal", "coffee", "tea", "cafe", "café", "té", "avena", "cocoa", "cacao"]),
    ("Salsas y condimentos", ["sauce", "condiment", "spice", "seasoning", "mayonnaise", "ketchup", "mustard", "salsa", "condimento", "aji", "ají", "mayonesa", "mostaza"]),
    ("Abarrotes", ["rice", "sugar", "oil", "pasta", "noodle", "flour", "arroz", "azucar", "azúcar", "aceite", "fideo", "pasta", "harina", "legume", "menestra"]),
    ("Panificados", ["bread", "bakery", "cake", "pastry", "pan", "panader", "bizcocho", "queque"]),
]

PRIORITY_TERMS = [term for _, terms in CATEGORY_RULES for term in terms]


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    value = unicodedata.normalize("NFC", str(value)).strip()
    value = re.sub(r"\s+", " ", value)
    return value or None


def split_tags(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def norm_search(value: str | None) -> str:
    if not value:
        return ""
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return value.lower()


def contains_term(text: str, term: str) -> bool:
    term = norm_search(term)
    if " " in term:
        return term in text
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", text) is not None


def has_peru(row: dict[str, str]) -> bool:
    countries = norm_search(" ".join([row.get("countries", ""), row.get("countries_tags", ""), row.get("countries_en", "")]))
    return "peru" in countries or "en:peru" in countries


def has_priority_category(row: dict[str, str]) -> bool:
    text = norm_search(" ".join([row.get("categories", ""), row.get("categories_tags", ""), row.get("categories_en", ""), row.get("product_name", ""), row.get("generic_name", "")]))
    return any(contains_term(text, term) for term in PRIORITY_TERMS)


def valid_check_digit(code: str) -> bool:
    if len(code) not in {8, 12, 13, 14}:
        return True
    digits = [int(ch) for ch in code]
    body = digits[:-1]
    total = 0
    weight = 3
    for digit in reversed(body):
        total += digit * weight
        weight = 1 if weight == 3 else 3
    return (10 - (total % 10)) % 10 == digits[-1]


def valid_barcode(code: str | None) -> bool:
    if not code:
        return False
    if not re.fullmatch(r"\d{8,14}", code):
        return False
    if set(code) == {"0"}:
        return False
    return valid_check_digit(code)


def normalize_brand(value: str | None) -> str | None:
    if not value:
        return None
    brands = [clean_text(part) for part in value.split(",")]
    return ", ".join(part for part in brands if part) or None


def normalize_countries(row: dict[str, str]) -> str | None:
    countries = split_tags(clean_text(row.get("countries")))
    if not countries:
        countries = split_tags(clean_text(row.get("countries_en")))
    normalized: list[str] = []
    for country in countries:
        if norm_search(country) in {"en:peru", "en:pe", "peru", "pe"}:
            country = "Peru"
        if country not in normalized:
            normalized.append(country)
    return ", ".join(normalized) or None


def normalize_category(row: dict[str, str]) -> str | None:
    category = clean_text(row.get("main_category_en")) or clean_text(row.get("main_category")) or clean_text(row.get("categories"))
    if category and "," in category:
        category = clean_text(category.split(",")[0])
    return category


def categorize(row: dict[str, Any]) -> str:
    text = norm_search(" ".join(str(row.get(key) or "") for key in ["category", "categories", "categories_tags", "name", "generic_name"]))
    if any(contains_term(text, term) for term in ["liqueur", "liquor", "alcoholic", "beer", "wine", "licor", "cerveza", "vino"]):
        return "Bebidas"
    for category, terms in CATEGORY_RULES:
        if any(contains_term(text, term) for term in terms):
            return category
    return "Otros"


def metadata_from_row(row: dict[str, str], image_front_url: str | None) -> dict[str, Any]:
    metadata = {
        "generic_name": clean_text(row.get("generic_name")),
        "serving_size": clean_text(row.get("serving_size")),
        "categories": clean_text(row.get("categories")),
        "categories_tags": split_tags(clean_text(row.get("categories_tags"))),
        "countries_tags": split_tags(clean_text(row.get("countries_tags"))),
        "image_front_url": image_front_url,
        "ingredients_text": clean_text(row.get("ingredients_text")),
        "packaging": clean_text(row.get("packaging")),
        "stores": clean_text(row.get("stores")),
        "labels": clean_text(row.get("labels")),
        "manufacturer": clean_text(row.get("brand_owner")) or clean_text(row.get("manufacturer")),
        "source_url": clean_text(row.get("url")),
        "extracted_at": datetime.now(timezone.utc).isoformat(),
    }
    return {key: value for key, value in metadata.items() if value not in (None, "", [])}


def transform(row: dict[str, str]) -> dict[str, Any] | None:
    code = clean_text(row.get("code"))
    if not valid_barcode(code):
        return None

    name = clean_text(row.get("product_name")) or clean_text(row.get("generic_name"))
    brand = normalize_brand(clean_text(row.get("brands")))
    category = normalize_category(row)
    quantity = clean_text(row.get("quantity"))
    image_url = clean_text(row.get("image_url")) or clean_text(row.get("image_front_url"))
    image_front_url = clean_text(row.get("image_front_url"))
    countries = normalize_countries(row)

    if not name:
        identifiers = [brand, quantity, category, clean_text(row.get("image_url"))]
        if sum(1 for item in identifiers if item) < 2:
            return None
        name = " ".join(item for item in [brand, quantity, category] if item)

    product = {
        "barcode": code,
        "name": name,
        "brand": brand,
        "quantity": quantity,
        "category": category,
        "image_url": image_url,
        "countries": countries,
        "source": SOURCE,
    }
    product["category_normalized"] = categorize({**row, **product})
    product["metadata"] = metadata_from_row(row, image_front_url)
    return product


def iter_off_csv(source_url: str) -> Iterable[dict[str, str]]:
    req = urllib.request.Request(source_url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as response:
        with gzip.GzipFile(fileobj=response) as gz:
            text = io.TextIOWrapper(gz, encoding="utf-8", newline="")
            yield from csv.DictReader(text, delimiter="\t")


def export(products: list[dict[str, Any]], output_csv: Path, output_jsonl: Path) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for product in products:
            row = {key: product.get(key) for key in CSV_COLUMNS}
            row["metadata"] = json.dumps(product.get("metadata") or {}, ensure_ascii=False, sort_keys=True)
            writer.writerow(row)

    with output_jsonl.open("w", encoding="utf-8") as jsonl_file:
        for product in products:
            jsonl_file.write(json.dumps(product, ensure_ascii=False, sort_keys=True) + "\n")


def write_stats(stats: dict[str, Any], products: list[dict[str, Any]], path: Path) -> None:
    stats["productos_con_imagen"] = sum(1 for product in products if product.get("image_url"))
    stats["productos_sin_imagen"] = len(products) - stats["productos_con_imagen"]
    stats["numero_marcas"] = len({product["brand"] for product in products if product.get("brand")})
    stats["distribucion_category_normalized"] = dict(Counter(product["category_normalized"] for product in products))
    path.write_text(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_validation_sample(products: list[dict[str, Any]], path: Path, sample_size: int) -> None:
    random.seed(775)
    sample = random.sample(products, min(sample_size, len(products)))
    columns = ["barcode", "name", "brand", "quantity", "category", "category_normalized", "countries", "image_url"]
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        for product in sample:
            writer.writerow({key: product.get(key) for key in columns})


def build(args: argparse.Namespace) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "source_url": args.source_url,
        "method": "official Open Food Facts CSV gzip export streamed row by row",
        "registros_examinados": 0,
        "productos_encontrados_para_peru": 0,
        "productos_validos": 0,
        "productos_descartados": 0,
        "duplicados": 0,
    }
    products_by_barcode: dict[str, dict[str, Any]] = {}

    for row in iter_off_csv(args.source_url):
        stats["registros_examinados"] += 1
        if args.max_records and stats["registros_examinados"] > args.max_records:
            break
        if not has_peru(row):
            continue
        stats["productos_encontrados_para_peru"] += 1
        if not has_priority_category(row):
            stats["productos_descartados"] += 1
            continue
        product = transform(row)
        if not product:
            stats["productos_descartados"] += 1
            continue
        barcode = product["barcode"]
        if barcode in products_by_barcode:
            stats["duplicados"] += 1
            if product.get("image_url") and not products_by_barcode[barcode].get("image_url"):
                products_by_barcode[barcode] = product
            continue
        products_by_barcode[barcode] = product

    products = sorted(products_by_barcode.values(), key=lambda item: (item["category_normalized"], item.get("brand") or "", item["name"]))
    stats["productos_validos"] = len(products)
    export(products, args.output_csv, args.output_jsonl)
    write_validation_sample(products, args.sample_output, args.sample_size)
    write_stats(stats, products, args.stats_output)
    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Peru product seed dataset from Open Food Facts")
    parser.add_argument("--source-url", default=OFF_CSV_URL)
    parser.add_argument("--output-csv", type=Path, default=Path("data/productos_peru.csv"))
    parser.add_argument("--output-jsonl", type=Path, default=Path("data/productos_peru.jsonl"))
    parser.add_argument("--stats-output", type=Path, default=Path("data/stats.json"))
    parser.add_argument("--sample-output", type=Path, default=Path("data/validation_sample.csv"))
    parser.add_argument("--sample-size", type=int, default=30)
    parser.add_argument("--max-records", type=int, default=0, help="Optional debug limit")
    return parser.parse_args()


def main() -> int:
    stats = build(parse_args())
    print(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
