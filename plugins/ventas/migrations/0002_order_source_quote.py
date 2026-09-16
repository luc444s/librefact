from __future__ import annotations

from sqlalchemy import inspect, text

revision = "0002"


def upgrade(db) -> None:
    bind = db.connection()
    inspector = inspect(bind)
    if not inspector.has_table("ventas_orders"):
        raise RuntimeError("ventas_orders must exist before applying ventas migration 0002")

    columns = {column["name"] for column in inspector.get_columns("ventas_orders")}
    if "source_quote_id" not in columns:
        bind.execute(text("ALTER TABLE ventas_orders ADD COLUMN source_quote_id VARCHAR(36)"))

    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_ventas_orders_source_quote_id "
            "ON ventas_orders(source_quote_id)"
        )
    )
    bind.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_orders_tenant_source_quote_id "
            "ON ventas_orders(tenant_id, source_quote_id)"
        )
    )


def downgrade(db) -> None:
    bind = db.connection()
    inspector = inspect(bind)
    if not inspector.has_table("ventas_orders"):
        return

    columns = {column["name"] for column in inspector.get_columns("ventas_orders")}
    if "source_quote_id" not in columns:
        return

    bind.execute(text("DROP INDEX IF EXISTS uq_ventas_orders_tenant_source_quote_id"))
    bind.execute(text("DROP INDEX IF EXISTS ix_ventas_orders_source_quote_id"))
    bind.execute(text("ALTER TABLE ventas_orders DROP COLUMN source_quote_id"))
