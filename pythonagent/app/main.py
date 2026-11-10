from contextlib import asynccontextmanager

import httpx
from fastapi import APIRouter, FastAPI

from app.common.schemas import ERROR_RESPONSES
from app.core.config import Settings
from app.core.errors import register_handlers
from app.core.middleware import RequestIDMiddleware
from app.infrastructure.database import Databases
from app.infrastructure.embeddings import OllamaEmbeddings
from app.modules.documents.router import router as document_router
from app.modules.health.router import router as health_router
from app.modules.users.router import router as user_router


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        databases = Databases(settings)
        try:
            async with httpx.AsyncClient(trust_env=False) as client:
                app.state.databases = databases
                app.state.embeddings = OllamaEmbeddings(settings, client)
                yield
        finally:
            await databases.close()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
        description="模块化 PostgreSQL / pgvector API；开发示例，尚未启用鉴权。",
    )
    app.state.settings = settings
    app.add_middleware(RequestIDMiddleware)
    register_handlers(app)
    api = APIRouter(prefix="/api/v1", responses=ERROR_RESPONSES)
    api.include_router(health_router)
    api.include_router(user_router)
    api.include_router(document_router)
    app.include_router(api)
    return app


app = create_app()
