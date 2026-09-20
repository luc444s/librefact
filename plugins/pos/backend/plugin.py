from __future__ import annotations

from systutor.sdk import PluginContext

from plugins.pos.backend.router import router

POS_PERMISSIONS = [
    "pos.session.read",
    "pos.session.manage",
    "pos.sale.create",
    "pos.product.quick_create",
    "pos.product.price",
]
POS_EVENTS = [
    "pos.session.opened",
    "pos.session.closed",
    "pos.sale.completed",
    "pos.product.quick_created",
    "pos.product.price_set",
]


def register(context: PluginContext) -> None:
    context.register_router(router)
    context.register_permissions(POS_PERMISSIONS)
    context.register_events(POS_EVENTS)
