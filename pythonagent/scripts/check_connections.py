"""Read-only database and optional embedding checks; no writes or DDL."""

import argparse
import asyncio
import json

import httpx

from app.core.config import Settings
from app.infrastructure.database import Databases
from app.infrastructure.embeddings import OllamaEmbeddings


async def check(include_embeddings=False):
    settings = Settings()
    databases = Databases(settings)
    try:
        statuses = await databases.check()
    finally:
        await databases.close()
    if include_embeddings:
        try:
            async with httpx.AsyncClient(trust_env=False) as client:
                vector = await OllamaEmbeddings(settings, client).embed("connection check")
            statuses["ollama"] = "ok"
            statuses["embedding_dimension"] = str(len(vector))
        except Exception:
            statuses["ollama"] = "unavailable"
    print(json.dumps(statuses, ensure_ascii=False, indent=2))
    return 0 if all(v == "ok" for k, v in statuses.items() if k != "embedding_dimension") else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--embeddings", action="store_true", help="Also generate one Ollama embedding"
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(check(args.embeddings)))
