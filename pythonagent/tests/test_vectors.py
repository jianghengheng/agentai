import math
from unittest.mock import AsyncMock

import httpx
import pytest


def test_document_model_reuses_mapping():
    from app.modules.documents.models import document_model
    from app.modules.users.models import User

    assert document_model(3) is document_model(3)
    assert document_model(3).__table__.schema == "public"
    assert User.__table__.schema == "public"


def test_vector_validation():
    from app.infrastructure.embeddings import validate_vector

    assert validate_vector([1, 2, 3], 3) == [1.0, 2.0, 3.0]
    for vector in [
        [],
        [0, 0, 0],
        [1, 2],
        [math.nan, 1, 2],
        [math.inf, 1, 2],
        ["1", 2, 3],
        [True, 2, 3],
        [1e100, 1, 2],
        [1e-100, 0, 0],
    ]:
        with pytest.raises(ValueError):
            validate_vector(vector, 3)


async def test_ollama_embedding():
    from app.core.config import Settings
    from app.infrastructure.embeddings import OllamaEmbeddings

    def respond(request):
        import json

        assert request.url.path == "/api/embed"
        assert json.loads(request.content)["truncate"] is False
        return httpx.Response(200, json={"embeddings": [[1, 2, 3]]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        embedding = OllamaEmbeddings(Settings(embedding_dimension=3, _env_file=None), client)
        assert await embedding.embed("hello") == [1, 2, 3]


@pytest.mark.parametrize(
    "status,payload",
    [
        (500, {}),
        (200, {"embeddings": [[0, 0, 0]]}),
        (200, {"embeddings": [[1, 2]]}),
        (200, {"embeddings": "bad"}),
    ],
)
async def test_ollama_errors_are_safe(status, payload):
    from app.core.config import Settings
    from app.core.errors import AppError
    from app.infrastructure.embeddings import OllamaEmbeddings

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(status, json=payload))
    ) as client:
        embedding = OllamaEmbeddings(Settings(embedding_dimension=3, _env_file=None), client)
        with pytest.raises(AppError) as exc:
            await embedding.embed("private input")
        assert exc.value.status_code == 503
        assert "private" not in exc.value.message


async def test_document_service_embeds_before_persisting():
    from app.modules.documents.schemas import DocumentCreate
    from app.modules.documents.service import DocumentService

    session = AsyncMock()
    session.add = lambda obj: None

    async def refresh(obj):
        from datetime import UTC, datetime
        from uuid import uuid4

        obj.id = uuid4()
        obj.created_at = datetime.now(UTC)

    session.refresh.side_effect = refresh
    embeddings = AsyncMock()
    embeddings.embed.return_value = [1, 2, 3]
    result = await DocumentService(session, embeddings, 3).create(
        DocumentCreate(text="hello", metadata={"source": "test"})
    )
    assert result.text == "hello"
    assert result.metadata == {"source": "test"}
    embeddings.embed.assert_awaited_once_with("hello")


async def test_search_uses_cosine_distance_and_limit():
    from sqlalchemy.dialects import postgresql

    from app.modules.documents.schemas import SearchRequest
    from app.modules.documents.service import DocumentService

    class Result:
        def all(self):
            return []

    session = AsyncMock()
    session.execute.return_value = Result()
    embeddings = AsyncMock()
    embeddings.embed.return_value = [1, 2, 3]
    result = await DocumentService(session, embeddings, 3).search(
        SearchRequest(query="hello", limit=50)
    )
    assert result == []
    statement = session.execute.call_args.args[0]
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "<=>" in sql and "LIMIT" in sql
    first = session.execute.call_args_list[0]
    assert "set_config" in str(first.args[0])
    assert int(first.args[1]["candidates"]) >= 50
