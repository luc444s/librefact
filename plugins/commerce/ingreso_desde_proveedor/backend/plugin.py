from systutor.sdk import PluginContext

from plugins.commerce.ingreso_desde_proveedor.backend.routers import router

INGRESO_DESDE_PROVEEDOR_PERMISSIONS = ["compras.order.receive"]


def register(context: PluginContext) -> None:
    context.register_router(router)
    context.register_permissions(INGRESO_DESDE_PROVEEDOR_PERMISSIONS)
