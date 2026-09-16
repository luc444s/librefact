from systutor.sdk import PluginContext

from plugins.commerce.ingreso_desde_proveedor.backend.plugin import (
    register as register_ingreso_desde_proveedor,
)
from plugins.commerce.purchase.backend.router import router

COMPRAS_PERMISSIONS = [
    "compras.supplier.read",
    "compras.supplier.manage",
    "compras.order.read",
    "compras.order.create",
    "compras.order.manage",
    "compras.dispatch.read",
    "compras.dispatch.manage",
]

COMPRAS_EVENTS = [
    "compras.order.created",
    "compras.order.received",
    "compras.order.cancelled",
]


def register(context: PluginContext) -> None:
    context.register_router(router)
    context.register_permissions(COMPRAS_PERMISSIONS)
    register_ingreso_desde_proveedor(context)
    context.register_events(COMPRAS_EVENTS)
