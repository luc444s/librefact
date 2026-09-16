from __future__ import annotations

from sqlalchemy import text

revision = "0001"


def upgrade(db) -> None:
    bind = db.connection()
    bind.execute(
        text("""
        CREATE TABLE IF NOT EXISTS ventas_orders (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL,
            customer_id VARCHAR(36) NOT NULL,
            customer_name VARCHAR(255),
            status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
            order_date DATE NOT NULL,
            expected_date DATE,
            notes TEXT,
            created_by VARCHAR(36) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    )
    bind.execute(
        text("""
        CREATE TABLE IF NOT EXISTS ventas_order_events (
            id VARCHAR(36) PRIMARY KEY,
            order_id VARCHAR(36) NOT NULL,
            from_status VARCHAR(20),
            to_status VARCHAR(20) NOT NULL,
            reason TEXT,
            user_id VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    )
    bind.execute(
        text("""
        CREATE TABLE IF NOT EXISTS ventas_order_items (
            id VARCHAR(36) PRIMARY KEY,
            order_id VARCHAR(36) NOT NULL,
            product_id VARCHAR(36) NOT NULL,
            quantity NUMERIC(10, 2) NOT NULL,
            unit_price NUMERIC(10, 2) NOT NULL,
            line_total NUMERIC(10, 2) NOT NULL,
            dispatched_qty NUMERIC(10, 2) NOT NULL DEFAULT 0
        )
    """)
    )
    bind.execute(
        text("CREATE INDEX IF NOT EXISTS ix_ventas_orders_tenant_id ON ventas_orders(tenant_id)")
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_ventas_orders_customer_id ON ventas_orders(customer_id)"
        )
    )
    bind.execute(
        text("CREATE INDEX IF NOT EXISTS ix_ventas_orders_status ON ventas_orders(status)")
    )
    bind.execute(
        text("CREATE INDEX IF NOT EXISTS ix_ventas_orders_order_date ON ventas_orders(order_date)")
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_ventas_orders_expected_date "
            "ON ventas_orders(expected_date)"
        )
    )
    bind.execute(
        text("CREATE INDEX IF NOT EXISTS ix_ventas_orders_created_by ON ventas_orders(created_by)")
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_ventas_order_events_order_id "
            "ON ventas_order_events(order_id)"
        )
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_ventas_order_events_user_id "
            "ON ventas_order_events(user_id)"
        )
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_ventas_order_items_order_id "
            "ON ventas_order_items(order_id)"
        )
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_ventas_order_items_product_id "
            "ON ventas_order_items(product_id)"
        )
    )


def downgrade(db) -> None:
    bind = db.connection()
    bind.execute(text("DROP TABLE IF EXISTS ventas_order_items"))
    bind.execute(text("DROP TABLE IF EXISTS ventas_order_events"))
    bind.execute(text("DROP TABLE IF EXISTS ventas_orders"))
