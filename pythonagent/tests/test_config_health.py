from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError


def test_config_secrets_and_postgres_urls():
    from app.core.config import Settings
    from app.infrastructure.database import sqlalchemy_url

    settings = Settings(database_url="postgresql://u:private@localhost/db", _env_file=None)
    assert "private" not in repr(settings)
    url = sqlalchemy_url(settings.database_url)
    assert url.drivername == "postgresql+psycopg"
    assert url.password == "private"
    with pytest.raises(ValidationError):
        Settings(database_url="sqlite:///bad.db", _env_file=None)
    with pytest.raises(ValidationError):
        Settings(embedding_dimension=0, _env_file=None)


async def test_readiness_failure_is_reported():
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app()
    with TestClient(app) as client:
        app.state.databases.check = AsyncMock(
            return_value={
                "database": "ok",
                "vector_database": "unavailable",
                "pgvector": "unavailable",
                "users_table": "ok",
                "documents_table": "unavailable",
            }
        )
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert response.json()["data"]["vector_database"] == "unavailable"


def test_initialization_requires_explicit_confirmation():
    import subprocess
    import sys

    p = subprocess.run([sys.executable, "-m", "scripts.init_db"], capture_output=True, text=True)
    assert p.returncode == 2
    assert "--yes" in p.stderr
