from fastapi import Depends
from systutor.api.deps import get_db_session
from systutor.kernel.auth.dependencies import get_current_tenant_context, require_permission

from plugins.commerce.purchase.backend.routers.common import _internal_token

DB_SESSION = Depends(get_db_session)
TENANT_CONTEXT = Depends(get_current_tenant_context)
REQUIRE_ORDER_RECEIVE = Depends(require_permission("compras.order.receive"))
