from fastapi import APIRouter

from plugins.ventas.backend.routers.dispatches import router as dispatches_router
from plugins.ventas.backend.routers.orders import router as orders_router
from plugins.ventas.backend.routers.receipts import router as receipts_router
from plugins.ventas.cotizacion.backend.routers.cotizaciones import router as cotizaciones_router

router = APIRouter()
router.include_router(orders_router)
router.include_router(dispatches_router)
router.include_router(receipts_router)
router.include_router(cotizaciones_router)
