"""Opt-in real integrations, transaction writes are always rolled back."""

import os
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

pytestmark = pytest.mark.skipif(
    os.getenv("PYTHONAGENT_LIVE_TESTS") != "1", reason="Set PYTHONAGENT_LIVE_TESTS=1"
)


async def test_live_database_embedding_and_api_with_rollback():
    from app.infrastructure.database import business_session, vector_session
    from app.main import create_app
    from app.modules.documents.models import document_model
    from app.modules.users.models import User

    app = create_app()
    async with app.router.lifespan_context(app):
        db = app.state.databases
        async with db.business.connect() as business, db.vector.connect() as vector:
            bt = await business.begin()
            vt = await vector.begin()
            try:
                async with (
                    AsyncSession(
                        bind=business,
                        join_transaction_mode="create_savepoint",
                        expire_on_commit=False,
                    ) as bs,
                    AsyncSession(
                        bind=vector,
                        join_transaction_mode="create_savepoint",
                        expire_on_commit=False,
                    ) as vs,
                ):

                    async def business_override():
                        yield bs

                    async def vector_override():
                        yield vs

                    app.dependency_overrides[business_session] = business_override
                    app.dependency_overrides[vector_session] = vector_override
                    async with httpx.AsyncClient(
                        transport=httpx.ASGITransport(app=app), base_url="http://test"
                    ) as client:
                        email = f"verify-{uuid4().hex}@example.com"
                        user = await client.post(
                            "/api/v1/users", json={"name": "Verification", "email": email}
                        )
                        assert user.status_code == 201, user.text
                        uid = user.json()["data"]["id"]
                        duplicate = await client.post(
                            "/api/v1/users", json={"name": "Duplicate", "email": email}
                        )
                        assert duplicate.status_code == 409, duplicate.text
                        page = await client.get("/api/v1/users")
                        assert page.status_code == 200
                        doc = await client.post(
                            "/api/v1/documents",
                            json={
                                "text": "FastAPI builds Python web APIs",
                                "metadata": {"verification": True},
                            },
                        )
                        assert doc.status_code == 201, doc.text
                        did = doc.json()["data"]["id"]
                        hits = await client.post(
                            "/api/v1/documents/search",
                            json={"query": "FastAPI builds Python web APIs", "limit": 50},
                        )
                        assert hits.status_code == 200, hits.text
                        hit = next(item for item in hits.json()["data"] if item["id"] == did)
                        assert hit["score"] > 0.99
            finally:
                app.dependency_overrides.clear()
                await bt.rollback()
                await vt.rollback()
        # Verify test rows did not persist after rolling back the outer transactions.
        from uuid import UUID

        async with db.business_sessions() as s:
            assert await s.scalar(select(User.id).where(User.id == uid)) is None
        model = document_model(app.state.settings.embedding_dimension)
        async with db.vector_sessions() as s:
            assert await s.scalar(select(model.id).where(model.id == UUID(did))) is None
