from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.infrastructure.database import business_session
from app.main import create_app
from app.modules.users.schemas import UserRead


def test_user_list_data_is_array_and_openapi_matches(monkeypatch):
    from app.modules.users.service import UserService

    async def list_users(self, page, page_size):
        assert (page, page_size) == (2, 5)
        return [
            UserRead(
                id="legacy-id", name=None, email="test@example.com", created_at=datetime.now(UTC)
            )
        ]

    async def session():
        yield object()

    monkeypatch.setattr(UserService, "list", list_users)
    app = create_app()
    app.dependency_overrides[business_session] = session
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/users?page=2&page_size=5")
        assert response.status_code == 200
        assert isinstance(response.json()["data"], list)
        assert response.json()["data"][0]["id"] == "legacy-id"
        schema = client.get("/openapi.json").json()
        ref = schema["paths"]["/api/v1/users"]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]["$ref"]
        data = schema["components"]["schemas"][ref.rsplit("/", 1)[1]]["properties"]["data"]
        assert any(item.get("type") == "array" for item in data["anyOf"])
