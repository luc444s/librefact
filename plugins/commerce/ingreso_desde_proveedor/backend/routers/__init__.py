from fastapi import APIRouter

from plugins.commerce.ingreso_desde_proveedor.backend.routers import receipts

router = APIRouter(prefix="/purchase", tags=["compras"])

router.include_router(receipts.router)
