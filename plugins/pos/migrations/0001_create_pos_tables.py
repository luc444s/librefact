from __future__ import annotations

from sqlalchemy import text

revision = "0001"


def upgrade(db) -> None:
    bind = db.connection()
    bind.execute(
        text("""
        CREATE TABLE IF NOT EXISTS pos_cash_sessions (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
            warehouse_id VARCHAR(36) NOT NULL REFERENCES branches(id),
            status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
            opening_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
            counted_amount NUMERIC(12, 2),
            expected_cash_amount NUMERIC(12, 2),
            difference NUMERIC(12, 2),
            notes TEXT,
            opened_by VARCHAR(36) NOT NULL REFERENCES users(id),
            closed_by VARCHAR(36) REFERENCES users(id),
            opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP WITH TIME ZONE
        )
        """)
    )
    bind.execute(
        text("""
        CREATE TABLE IF NOT EXISTS pos_payments (
            id VARCHAR(36) PRIMARY KEY,
            tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
            session_id VARCHAR(36) NOT NULL REFERENCES pos_cash_sessions(id),
            order_id VARCHAR(36) NOT NULL REFERENCES ventas_orders(id),
            method VARCHAR(20) NOT NULL,
            amount NUMERIC(12, 2) NOT NULL,
            received_amount NUMERIC(12, 2),
            change_amount NUMERIC(12, 2),
            created_by VARCHAR(36) NOT NULL REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """)
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_pos_cash_sessions_tenant_id "
            "ON pos_cash_sessions(tenant_id)"
        )
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_pos_cash_sessions_warehouse_id "
            "ON pos_cash_sessions(warehouse_id)"
        )
    )
    bind.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_pos_cash_sessions_status "
            "ON pos_cash_sessions(status)"
        )
    )
    bind.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_cash_sessions_open "
            "ON pos_cash_sessions(tenant_id, warehouse_id) WHERE status = 'OPEN'"
        )
    )
    bind.execute(
        text("CREATE INDEX IF NOT EXISTS ix_pos_payments_tenant_id ON pos_payments(tenant_id)")
    )
    bind.execute(
        text("CREATE INDEX IF NOT EXISTS ix_pos_payments_session_id ON pos_payments(session_id)")
    )
    bind.execute(
        text("CREATE INDEX IF NOT EXISTS ix_pos_payments_order_id ON pos_payments(order_id)")
    )
    bind.execute(
        text("CREATE INDEX IF NOT EXISTS ix_pos_payments_method ON pos_payments(method)")
    )


def downgrade(db) -> None:
    bind = db.connection()
    bind.execute(text("DROP TABLE IF EXISTS pos_payments"))
    bind.execute(text("DROP TABLE IF EXISTS pos_cash_sessions"))
