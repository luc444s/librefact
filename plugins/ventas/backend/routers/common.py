"""Dependencias compartidas y helpers de la capa HTTP de ventas."""
from __future__ import annotations

from fastapi import Depends
from systutor.api.deps import get_db_session
from systutor.kernel.auth.dependencies import get_current_tenant_context, require_permission

DB_SESSION = Depends(get_db_session)
TENANT_CONTEXT = Depends(get_current_tenant_context)

REQUIRE_ORDER_READ = Depends(require_permission("ventas.order.read"))
REQUIRE_ORDER_CREATE = Depends(require_permission("ventas.order.create"))
REQUIRE_ORDER_MANAGE = Depends(require_permission("ventas.order.manage"))
REQUIRE_ORDER_DISPATCH = Depends(require_permission("ventas.dispatch.manage"))
REQUIRE_SALES_DISPATCH_READ = Depends(require_permission("ventas.dispatch.read"))
REQUIRE_SALES_DISPATCH_MANAGE = Depends(require_permission("ventas.dispatch.manage"))
REQUIRE_SALES_RECEIPT_READ = Depends(require_permission("ventas.receipt.read"))
REQUIRE_SALES_RECEIPT_MANAGE = Depends(require_permission("ventas.receipt.manage"))
