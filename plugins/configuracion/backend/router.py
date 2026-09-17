from __future__ import annotations

from typing import Never

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from systutor.api.deps import get_db_session
from systutor.kernel.auth.dependencies import get_current_tenant_context, require_permission
from systutor.kernel.tenants.context import TenantContext

from plugins.configuracion.backend.schemas import (
    DocumentSeriesCreateRequest,
    DocumentSeriesRead,
    DocumentSeriesUpdateRequest,
)
from plugins.configuracion.backend.services import (
    create_document_series,
    list_document_series,
    update_document_series,
)

router = APIRouter(tags=["configuracion"])
DB_SESSION = Depends(get_db_session)
TENANT_CONTEXT = Depends(get_current_tenant_context)

REQUIRE_SERIES_READ = Depends(require_permission("configuracion.document_series.read"))
REQUIRE_SERIES_MANAGE = Depends(require_permission("configuracion.document_series.manage"))


def _raise_service_error(exc: Exception) -> Never:
    if isinstance(exc, LookupError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    raise exc


@router.get(
    "/billing/document-series",
    response_model=list[DocumentSeriesRead],
    dependencies=[REQUIRE_SERIES_READ],
)
def get_document_series(
    document_type: str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    tenant_context: TenantContext = TENANT_CONTEXT,
    db: Session = DB_SESSION,
) -> list[DocumentSeriesRead]:
    items = list_document_series(
        db,
        tenant_id=tenant_context.current_tenant_id,
        document_type=document_type,
        branch_id=branch_id,
    )
    return [DocumentSeriesRead.model_validate(item) for item in items]


@router.post(
    "/billing/document-series",
    response_model=DocumentSeriesRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[REQUIRE_SERIES_MANAGE],
)
def post_document_series(
    payload: DocumentSeriesCreateRequest,
    tenant_context: TenantContext = TENANT_CONTEXT,
    db: Session = DB_SESSION,
) -> DocumentSeriesRead:
    try:
        item = create_document_series(
            db,
            tenant_id=tenant_context.current_tenant_id,
            user_id=tenant_context.current_user_id,
            payload=payload,
        )
        db.commit()
        db.refresh(item)
        return DocumentSeriesRead.model_validate(item)
    except Exception as exc:
        db.rollback()
        _raise_service_error(exc)


@router.put(
    "/billing/document-series/{series_id}",
    response_model=DocumentSeriesRead,
    dependencies=[REQUIRE_SERIES_MANAGE],
)
def put_document_series(
    series_id: str,
    payload: DocumentSeriesUpdateRequest,
    tenant_context: TenantContext = TENANT_CONTEXT,
    db: Session = DB_SESSION,
) -> DocumentSeriesRead:
    try:
        item = update_document_series(
            db,
            tenant_id=tenant_context.current_tenant_id,
            series_id=series_id,
            payload=payload,
        )
        db.commit()
        db.refresh(item)
        return DocumentSeriesRead.model_validate(item)
    except Exception as exc:
        db.rollback()
        _raise_service_error(exc)
