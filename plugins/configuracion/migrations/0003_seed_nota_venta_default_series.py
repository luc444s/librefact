from __future__ import annotations

from sqlalchemy import text

revision = "0003"


def upgrade(db) -> None:
    bind = db.connection()
    bind.execute(
        text(
            """
            INSERT INTO cfg_document_series
              (id, tenant_id, branch_id, document_type, series, initial_number, next_number,
               is_default, is_active, created_by, created_at, updated_at)
            SELECT
              gen_random_uuid()::text,
              tenants.id,
              NULL,
              'NOTA_VENTA',
              'N001',
              1,
              1,
              TRUE,
              TRUE,
              users.id,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            FROM tenants
            JOIN LATERAL (
              SELECT id
              FROM users
              WHERE users.tenant_id = tenants.id
              ORDER BY created_at ASC
              LIMIT 1
            ) users ON TRUE
            WHERE NOT EXISTS (
              SELECT 1
              FROM cfg_document_series existing
              WHERE existing.tenant_id = tenants.id
                AND existing.branch_id IS NULL
                AND existing.document_type = 'NOTA_VENTA'
                AND existing.series = 'N001'
            )
            """
        )
    )


def downgrade(db) -> None:
    bind = db.connection()
    bind.execute(
        text(
            """
            DELETE FROM cfg_document_series
            WHERE document_type = 'NOTA_VENTA'
              AND series = 'N001'
              AND initial_number = 1
              AND next_number = 1
            """
        )
    )
