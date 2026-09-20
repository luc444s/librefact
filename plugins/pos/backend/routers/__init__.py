from fastapi import APIRouter

from plugins.pos.backend.routers.checkout import router as checkout_router
from plugins.pos.backend.routers.products import router as products_router
from plugins.pos.backend.routers.sessions import router as sessions_router

router = APIRouter()
router.include_router(sessions_router)
router.include_router(checkout_router)
router.include_router(products_router)
