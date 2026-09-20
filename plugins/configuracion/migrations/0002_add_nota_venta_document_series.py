from __future__ import annotations

from sqlalchemy import text

revision = "0002"


def upgrade(db) -> None:
    bind = db.connection()
    bind.execute(text("ALTER TABLE cfg_document_series DROP CONSTRAINT IF EXISTS ck_cfg_document_series_type"))
    bind.execute(text("ALTER TABLE cfg_document_series DROP CONSTRAINT IF EXISTS ck_cfg_document_series_format"))
    bind.execute(
        text(
            """
            ALTER TABLE cfg_document_series
            ADD CONSTRAINT ck_cfg_document_series_type
            CHECK (document_type IN ('FACTURA', 'BOLETA', 'NOTA_VENTA', 'ORDEN_COMPRA'))
            """
        )
    )
    bind.execute(
        text(
            """
            ALTER TABLE cfg_document_series
            ADD CONSTRAINT ck_cfg_document_series_format
            CHECK (
                (document_type = 'FACTURA' AND series ~ '^F[0-9]{3}$') OR
                (document_type = 'BOLETA' AND series ~ '^B[0-9]{3}$') OR
                (document_type = 'NOTA_VENTA' AND series ~ '^N[0-9]{3}$') OR
                (document_type = 'ORDEN_COMPRA' AND series ~ '^OC$')
            )
            """
        )
    )


def downgrade(db) -> None:
    bind = db.connection()
    bind.execute(text("DELETE FROM cfg_document_series WHERE document_type = 'NOTA_VENTA'"))
    bind.execute(text("ALTER TABLE cfg_document_series DROP CONSTRAINT IF EXISTS ck_cfg_document_series_type"))
    bind.execute(text("ALTER TABLE cfg_document_series DROP CONSTRAINT IF EXISTS ck_cfg_document_series_format"))
    bind.execute(
        text(
            """
            ALTER TABLE cfg_document_series
            ADD CONSTRAINT ck_cfg_document_series_type
            CHECK (document_type IN ('FACTURA', 'BOLETA', 'ORDEN_COMPRA'))
            """
        )
    )
    bind.execute(
        text(
            """
            ALTER TABLE cfg_document_series
            ADD CONSTRAINT ck_cfg_document_series_format
            CHECK (
                (document_type = 'FACTURA' AND series ~ '^F[0-9]{3}$') OR
                (document_type = 'BOLETA' AND series ~ '^B[0-9]{3}$') OR
                (document_type = 'ORDEN_COMPRA' AND series ~ '^OC$')
            )
            """
        )
    )
