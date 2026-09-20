"""Dependencias y helpers compartidos del plugin POS."""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Request
from sqlalchemy.orm import Session
from systutor.api.deps import get_db_session
from systutor.contracts.events import EventContract
from systutor.kernel.audit.service import record_audit
from systutor.kernel.auth.dependencies import get_current_tenant_context, require_permission
from systutor.kernel.events.service import emit_event
from systutor.kernel.tenants.context import TenantContext

DB_SESSION = Depends(get_db_session)
TENANT_CONTEXT = Depends(get_current_tenant_context)

REQUIRE_SESSION_READ = Depends(require_permission("pos.session.read"))
REQUIRE_SESSION_MANAGE = Depends(require_permission("pos.session.manage"))
REQUIRE_SALE_CREATE = Depends(require_permission("pos.sale.create"))
REQUIRE_PRODUCT_QUICK = Depends(require_permission("pos.product.quick_create"))
REQUIRE_PRODUCT_PRICE = Depends(require_permission("pos.product.price"))


@dataclass(slots=True)
class PosActionContext:
    tenant_id: str
    branch_id: str | None
    actor_user_id: str
    correlation_id: str | None
    request_id: str | None


def build_action_context(request: Request, tenant_context: TenantContext) -> PosActionContext:
    return PosActionContext(
        tenant_id=tenant_context.current_tenant_id,
        branch_id=tenant_context.current_branch_id,
        actor_user_id=tenant_context.current_user_id,
        correlation_id=getattr(request.state, "correlation_id", None),
        request_id=getattr(request.state, "request_id", None),
    )


def resolve_warehouse_id(
    tenant_context: TenantContext, requested: str | None = None
) -> str:
    if requested:
        if not tenant_context.has_warehouse_access(requested):
            raise ValueError("Sin acceso al almacén indicado")
        return requested
    branch_id = tenant_context.current_branch_id
    if branch_id and tenant_context.has_warehouse_access(branch_id):
        return branch_id
    warehouse_ids = tenant_context.current_warehouse_ids
    if warehouse_ids and len(warehouse_ids) == 1:
        return warehouse_ids[0]
    raise ValueError("No hay almacén/sucursal disponible para la caja")


def audit_pos_action(
    db: Session,
    *,
    context: PosActionContext,
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict[str, object],
    result: str = "success",
) -> None:
    record_audit(
        db,
        tenant_id=context.tenant_id,
        branch_id=context.branch_id,
        actor_user_id=context.actor_user_id,
        actor_type="user",
        module="pos",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        result=result,
        correlation_id=context.correlation_id,
        request_id=context.request_id,
        details=details,
    )


def emit_pos_event(
    db: Session,
    *,
    context: PosActionContext,
    event_name: str,
    entity_type: str,
    entity_id: str,
    payload: dict[str, object],
) -> None:
    emit_event(
        db,
        event=EventContract(
            event_name=event_name,
            module="pos",
            tenant_id=context.tenant_id,
            branch_id=context.branch_id,
            actor_user_id=context.actor_user_id,
            actor_type="user",
            entity_type=entity_type,
            entity_id=entity_id,
            correlation_id=context.correlation_id,
            payload=payload,
            metadata={"request_id": context.request_id} if context.request_id else {},
        ),
    )
