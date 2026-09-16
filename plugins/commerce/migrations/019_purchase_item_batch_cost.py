from sqlalchemy import inspect, text

revision = "0019"


def upgrade(db) -> None:
    bind = db.connection()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("com_purchase_items")}

    if "batch_cost" not in columns:
        bind.execute(text("ALTER TABLE com_purchase_items ADD COLUMN batch_cost NUMERIC(10,2)"))
        columns.add("batch_cost")

    if "batch_cost" in columns:
        bind.execute(
            text(
                "UPDATE com_purchase_items SET batch_cost = COALESCE(batch_cost, quantity * unit_cost)"
            )
        )


def downgrade(db) -> None:
    bind = db.connection()
    inspector = inspect(bind)
    columns = {col["name"] for col in inspector.get_columns("com_purchase_items")}

    if "batch_cost" in columns:
        bind.execute(text("ALTER TABLE com_purchase_items DROP COLUMN batch_cost"))
