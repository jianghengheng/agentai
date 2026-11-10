"""Explicit additive schema initialization. Never called during application startup."""

import argparse
import asyncio

from sqlalchemy import text

from app.core.config import Settings
from app.infrastructure.database import Databases
from app.modules.documents.models import document_model
from app.modules.users.models import UserBase


async def initialize(settings: Settings):
    databases = Databases(settings)
    try:
        async with databases.business.begin() as conn:
            await conn.run_sync(UserBase.metadata.create_all)
        async with databases.vector.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            model = document_model(settings.embedding_dimension)
            await conn.run_sync(model.metadata.create_all)
        checks = await databases.check()
        if any(status != "ok" for status in checks.values()):
            raise RuntimeError(
                "Schema checks failed; inspect existing table structure and dimension"
            )
        print('Ensured public."User" and public.pythonagent_documents; existing tables untouched.')
    finally:
        await databases.close()


def main():
    parser = argparse.ArgumentParser(description="Add project tables and pgvector extension")
    parser.add_argument(
        "--yes", action="store_true", help="Confirm additive DDL on configured databases"
    )
    args = parser.parse_args()
    if not args.yes:
        parser.error("Pass --yes to create the pgvector extension and pythonagent project tables")
    try:
        asyncio.run(initialize(Settings()))
    except Exception as exc:
        parser.exit(
            1,
            f"Initialization failed ({type(exc).__name__}); "
            "verify configuration and permissions.\n",
        )


if __name__ == "__main__":
    main()
