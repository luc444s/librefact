from __future__ import annotations

from sqlalchemy import text

revision = "0001"


def upgrade(db) -> None:
    bind = db.connection()
    bind.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS cfg_document_series (
                id VARCHAR(36) PRIMARY KEY,
                tenant_id VARCHAR(36) NOT NULL REFERENCES tenants(id),
                branch_id VARCHAR(36) REFERENCES branches(id),
                document_type VARCHAR(20) NOT NULL,
                series VARCHAR(4) NOT NULL,
                initial_number INTEGER NOT NULL,
                next_number INTEGER NOT NULL,
                is_default BOOLEAN NOT NULL DEFAULT FALSE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by VARCHAR(36) NOT NULL REFERENCES users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT ck_cfg_document_series_type CHECK (document_type IN ('FACTURA', 'BOLETA')),
                CONSTRAINT ck_cfg_document_series_numbers CHECK (initial_number >= 1 AND next_number >= 1),
                CONSTRAINT ck_cfg_document_series_format CHECK (
                    (document_type = 'FACTURA' AND series ~ '^F[0-9]{3}$') OR
                    (document_type = 'BOLETA' AND series ~ '^B[0-9]{3}$')
                ),
                CONSTRAINT ck_cfg_document_series_default_active CHECK (is_default = FALSE OR is_active = TRUE)
            )
            """
        )
    )
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_cfg_document_series_tenant ON cfg_document_series (tenant_id)"))
    bind.execute(text("CREATE INDEX IF NOT EXISTS ix_cfg_document_series_branch ON cfg_document_series (branch_id)"))
    bind.execute(
        text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cfg_document_series_global
            ON cfg_document_series (tenant_id, document_type, series)
            WHERE branch_id IS NULL
            """
        )
    )
    bind.execute(
        text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cfg_document_series_branch
            ON cfg_document_series (tenant_id, document_type, series, branch_id)
            WHERE branch_id IS NOT NULL
            """
        )
    )
    bind.execute(
        text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cfg_document_series_default_global
            ON cfg_document_series (tenant_id, document_type)
            WHERE branch_id IS NULL AND is_default = TRUE AND is_active = TRUE
            """
        )
    )
    bind.execute(
        text(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_cfg_document_series_default_branch
            ON cfg_document_series (tenant_id, document_type, branch_id)
            WHERE branch_id IS NOT NULL AND is_default = TRUE AND is_active = TRUE
            """
        )
    )


def downgrade(db) -> None:
    bind = db.connection()
    bind.execute(text("DROP TABLE IF EXISTS cfg_document_series"))
