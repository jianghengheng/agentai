import asyncio
from collections.abc import AsyncIterator

from fastapi import Request
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings


def sqlalchemy_url(secret: SecretStr) -> URL:
    return make_url(secret.get_secret_value()).set(drivername="postgresql+psycopg")


class Databases:
    def __init__(self, settings: Settings):
        self.timeout = settings.db_timeout_seconds
        options = {
            "pool_pre_ping": True,
            "pool_size": 5,
            "max_overflow": 5,
            "pool_timeout": self.timeout,
            "hide_parameters": True,
            "connect_args": {
                "connect_timeout": self.timeout,
                "options": f"-c statement_timeout={self.timeout * 1000}",
            },
        }
        self.business = create_async_engine(sqlalchemy_url(settings.database_url), **options)
        self.vector = create_async_engine(sqlalchemy_url(settings.rag_database_url), **options)
        self.business_sessions = async_sessionmaker(self.business, expire_on_commit=False)
        self.vector_sessions = async_sessionmaker(self.vector, expire_on_commit=False)
        self.dimension = settings.embedding_dimension

    async def close(self):
        await asyncio.gather(self.business.dispose(), self.vector.dispose())

    async def check(self) -> dict[str, str]:
        async def inspect(engine, vector=False):
            result = {"vector_database" if vector else "database": "unavailable"}
            if vector:
                result.update(pgvector="unavailable", documents_table="unavailable")
            else:
                result["users_table"] = "unavailable"
            try:
                async with asyncio.timeout(self.timeout + 1):
                    async with engine.connect() as conn:
                        await conn.execute(text("SET TRANSACTION READ ONLY"))
                        await conn.execute(text("SELECT 1"))
                        result["vector_database" if vector else "database"] = "ok"
                        if vector:
                            extension = await conn.scalar(
                                text("SELECT extversion FROM pg_extension WHERE extname='vector'")
                            )
                            result["pgvector"] = "ok" if extension else "missing"
                            table = await conn.scalar(
                                text("SELECT to_regclass('public.pythonagent_documents')")
                            )
                            result["documents_table"] = "ok" if table else "missing"
                            if table:
                                vector_type = await conn.scalar(
                                    text(
                                        "SELECT format_type(atttypid, atttypmod) FROM pg_attribute "
                                        "WHERE attrelid='public.pythonagent_documents'::regclass "
                                        "AND attname='embedding' AND NOT attisdropped"
                                    )
                                )
                                if vector_type != f"vector({self.dimension})":
                                    result["documents_table"] = "dimension_mismatch"
                        else:
                            table = await conn.scalar(
                                text("SELECT to_regclass(:table)"), {"table": 'public."User"'}
                            )
                            result["users_table"] = "ok" if table else "missing"
            except Exception:
                pass  # Health output intentionally excludes database details and credentials.
            return result

        a, b = await asyncio.gather(inspect(self.business), inspect(self.vector, True))
        return {**a, **b}


async def business_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.databases.business_sessions() as session:
        yield session


async def vector_session(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.databases.vector_sessions() as session:
        yield session
