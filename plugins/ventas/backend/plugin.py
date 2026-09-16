from __future__ import annotations

from systutor.sdk import PluginContext

from plugins.ventas.backend.router import router

VENTAS_PERMISSIONS = [
    "ventas.quote.read",
    "ventas.quote.manage",
    "ventas.customer.read",
    "ventas.customer.manage",
    "ventas.order.read",
    "ventas.order.create",
    "ventas.order.manage",
    "ventas.dispatch.read",
    "ventas.dispatch.manage",
    "ventas.receipt.read",
    "ventas.receipt.manage",
]
VENTAS_EVENTS = [
    "ventas.quote.created",
    "ventas.quote.status_changed",
    "ventas.quote.confirmed",
    "ventas.quote.converted",
    "ventas.order.created",
    "ventas.order.status_changed",
    "ventas.order.confirmed",
    "ventas.order.dispatched",
    "ventas.order.cancelled",
    "ventas.order.closed",
    "ventas.dispatch.created",
    "ventas.dispatch.status_changed",
    "ventas.dispatch.confirmed",
    "ventas.dispatch.cancelled",
    "ventas.receipt.created",
    "ventas.receipt.status_changed",
    "ventas.receipt.confirmed",
    "ventas.receipt.cancelled",
]


def register(context: PluginContext) -> None:
    context.register_router(router)
    context.register_permissions(VENTAS_PERMISSIONS)
    context.register_events(VENTAS_EVENTS)
