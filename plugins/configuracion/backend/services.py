from __future__ import annotations

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session
from systutor.kernel.tenants.models import Branch

from plugins.configuracion.backend.models import ConfigDocumentSeries
from plugins.configuracion.backend.schemas import (
    DocumentSeriesCreateRequest,
    DocumentSeriesUpdateRequest,
)


def list_document_series(
    db: Session,
    *,
    tenant_id: str,
    document_type: str | None = None,
    branch_id: str | None = None,
) -> list[ConfigDocumentSeries]:
    stmt = select(ConfigDocumentSeries).where(ConfigDocumentSeries.tenant_id == tenant_id)
    if document_type:
        stmt = stmt.where(ConfigDocumentSeries.document_type == document_type)
    if branch_id:
        stmt = stmt.where(ConfigDocumentSeries.branch_id == branch_id)
    stmt = stmt.order_by(
        ConfigDocumentSeries.document_type.asc(),
        ConfigDocumentSeries.branch_id.asc().nullsfirst(),
        ConfigDocumentSeries.series.asc(),
    )
    return list(db.scalars(stmt))


def create_document_series(
    db: Session,
    *,
    tenant_id: str,
    user_id: str,
    payload: DocumentSeriesCreateRequest,
) -> ConfigDocumentSeries:
    series = payload.validated_series()
    _validate_active_default(payload.is_active, payload.is_default)
    _require_branch(db, tenant_id=tenant_id, branch_id=payload.branch_id)
    _ensure_unique(
        db,
        tenant_id=tenant_id,
        document_type=payload.document_type,
        series=series,
        branch_id=payload.branch_id,
    )

    item = ConfigDocumentSeries(
        tenant_id=tenant_id,
        branch_id=payload.branch_id,
        document_type=payload.document_type,
        series=series,
        initial_number=payload.initial_number,
        next_number=payload.initial_number,
        is_default=payload.is_default,
        is_active=payload.is_active,
        created_by=user_id,
    )
    db.add(item)
    if item.is_default:
        db.flush()
        _unset_other_defaults(db, item)
    return item


def update_document_series(
    db: Session,
    *,
    tenant_id: str,
    series_id: str,
    payload: DocumentSeriesUpdateRequest,
) -> ConfigDocumentSeries:
    item = db.scalar(
        select(ConfigDocumentSeries).where(
            ConfigDocumentSeries.id == series_id,
            ConfigDocumentSeries.tenant_id == tenant_id,
        )
    )
    if item is None:
        raise LookupError("Document series not found")

    next_branch_id = payload.branch_id if "branch_id" in payload.model_fields_set else item.branch_id
    next_is_active = payload.is_active if payload.is_active is not None else item.is_active
    next_is_default = payload.is_default if payload.is_default is not None else item.is_default
    _validate_active_default(next_is_active, next_is_default)
    _require_branch(db, tenant_id=tenant_id, branch_id=next_branch_id)

    if next_branch_id != item.branch_id:
        _ensure_unique(
            db,
            tenant_id=tenant_id,
            document_type=item.document_type,
            series=item.series,
            branch_id=next_branch_id,
            exclude_id=item.id,
        )
        item.branch_id = next_branch_id
    if payload.is_active is not None:
        item.is_active = payload.is_active
    if payload.is_default is not None:
        item.is_default = payload.is_default
    if item.is_default:
        _unset_other_defaults(db, item)
    return item


def _validate_active_default(is_active: bool, is_default: bool) -> None:
    if is_default and not is_active:
        raise ValueError("Default document series must be active")


def _require_branch(db: Session, *, tenant_id: str, branch_id: str | None) -> None:
    if branch_id is None:
        return
    branch = db.scalar(select(Branch).where(Branch.id == branch_id, Branch.tenant_id == tenant_id))
    if branch is None:
        raise ValueError("Branch not found")


def _ensure_unique(
    db: Session,
    *,
    tenant_id: str,
    document_type: str,
    series: str,
    branch_id: str | None,
    exclude_id: str | None = None,
) -> None:
    stmt = select(ConfigDocumentSeries.id).where(
        ConfigDocumentSeries.tenant_id == tenant_id,
        ConfigDocumentSeries.document_type == document_type,
        ConfigDocumentSeries.series == series,
    )
    if branch_id is None:
        stmt = stmt.where(ConfigDocumentSeries.branch_id.is_(None))
    else:
        stmt = stmt.where(ConfigDocumentSeries.branch_id == branch_id)
    if exclude_id is not None:
        stmt = stmt.where(ConfigDocumentSeries.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise ValueError("Document series already exists for this scope")


def _unset_other_defaults(db: Session, item: ConfigDocumentSeries) -> None:
    branch_filter = (
        ConfigDocumentSeries.branch_id.is_(None)
        if item.branch_id is None
        else ConfigDocumentSeries.branch_id == item.branch_id
    )
    db.execute(
        update(ConfigDocumentSeries)
        .where(
            ConfigDocumentSeries.tenant_id == item.tenant_id,
            ConfigDocumentSeries.document_type == item.document_type,
            branch_filter,
            ConfigDocumentSeries.id != item.id,
            or_(ConfigDocumentSeries.is_default.is_(True), ConfigDocumentSeries.is_active.is_(True)),
        )
        .values(is_default=False)
    )
