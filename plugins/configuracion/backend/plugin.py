from __future__ import annotations

from systutor.sdk import PluginContext

from plugins.configuracion.backend.router import router

CONFIGURACION_PERMISSIONS = [
    "configuracion.document_series.read",
    "configuracion.document_series.manage",
]


def register(context: PluginContext) -> None:
    context.register_router(router)
    context.register_permissions(CONFIGURACION_PERMISSIONS)
    context.register_events([])
