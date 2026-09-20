from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.orm import Session
from systutor.kernel.tenants.context import TenantContext

from plugins.pos.backend.common import (
    DB_SESSION,
    REQUIRE_SESSION_MANAGE,
    REQUIRE_SESSION_READ,
    TENANT_CONTEXT,
    build_action_context,
    resolve_warehouse_id,
)
from plugins.pos.backend.schemas import (
    CloseSessionRequest,
    OpenSessionRequest,
    PosCashSessionRead,
    SessionSummaryRead,
)
from plugins.pos.backend.services import sessions

router = APIRouter(prefix="/sessions", tags=["pos"])


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


@router.post(
    "/open",
    response_model=PosCashSessionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[REQUIRE_SESSION_MANAGE],
)
def open_session(
    payload: OpenSessionRequest,
    request: Request,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> PosCashSessionRead:
    try:
        warehouse_id = resolve_warehouse_id(tenant_context, payload.warehouse_id)
        session = sessions.open_session(
            db,
            tenant_id=tenant_context.current_tenant_id,
            warehouse_id=warehouse_id,
            opening_amount=payload.opening_amount,
            user_id=tenant_context.current_user_id,
            action_context=build_action_context(request, tenant_context),
        )
    except ValueError as exc:
        raise _bad_request(str(exc)) from exc
    db.commit()
    return PosCashSessionRead.model_validate(session)


@router.get(
    "/current",
    response_model=PosCashSessionRead | None,
    dependencies=[REQUIRE_SESSION_READ],
)
def current_session(
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> PosCashSessionRead | None:
    try:
        warehouse_id = resolve_warehouse_id(tenant_context)
    except ValueError:
        return None
    session = sessions.get_open_session(
        db, tenant_id=tenant_context.current_tenant_id, warehouse_id=warehouse_id
    )
    if session is None:
        return None
    return PosCashSessionRead.model_validate(session)


@router.get(
    "/{session_id}/summary",
    response_model=SessionSummaryRead,
    dependencies=[REQUIRE_SESSION_READ],
)
def session_summary(
    session_id: str,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> SessionSummaryRead:
    session = sessions.get_session(
        db, tenant_id=tenant_context.current_tenant_id, session_id=session_id
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")
    data = sessions.build_summary(db, session=session)
    data["session"] = PosCashSessionRead.model_validate(session)
    return SessionSummaryRead(**data)


@router.post(
    "/{session_id}/close",
    response_model=PosCashSessionRead,
    dependencies=[REQUIRE_SESSION_MANAGE],
)
def close_session(
    session_id: str,
    payload: CloseSessionRequest,
    request: Request,
    db: Session = DB_SESSION,
    tenant_context: TenantContext = TENANT_CONTEXT,
) -> PosCashSessionRead:
    session = sessions.get_session(
        db, tenant_id=tenant_context.current_tenant_id, session_id=session_id
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")
    try:
        session = sessions.close_session(
            db,
            session=session,
            counted_amount=payload.counted_amount,
            notes=payload.notes,
            user_id=tenant_context.current_user_id,
            action_context=build_action_context(request, tenant_context),
        )
    except ValueError as exc:
        raise _bad_request(str(exc)) from exc
    db.commit()
    return PosCashSessionRead.model_validate(session)
