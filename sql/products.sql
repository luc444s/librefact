CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode VARCHAR UNIQUE NOT NULL,
    name VARCHAR NOT NULL,
    brand VARCHAR,
    quantity VARCHAR,
    category VARCHAR,
    category_normalized VARCHAR,
    image_url TEXT,
    countries TEXT,
    source VARCHAR NOT NULL DEFAULT 'open_food_facts',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_normalized_idx ON products (category_normalized);
CREATE INDEX IF NOT EXISTS products_brand_idx ON products (brand);
CREATE INDEX IF NOT EXISTS products_metadata_gin_idx ON products USING GIN (metadata);
