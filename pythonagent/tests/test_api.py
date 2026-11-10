import importlib.util

import pytest


def test_application_module_exists():
    assert importlib.util.find_spec("app") is not None, "FastAPI application not implemented"


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(), raise_server_exceptions=False) as c:
        yield c


def test_live_envelope(client):
    r = client.get("/api/v1/health/live")
    assert r.status_code == 200
    assert r.json()["code"] == 0
    assert r.json()["data"] == {"status": "ok"}
    assert r.json()["request_id"] == r.headers["x-request-id"]


@pytest.mark.parametrize(
    "method,path,status", [("get", "/missing", 404), ("post", "/api/v1/health/live", 405)]
)
def test_http_errors(client, method, path, status):
    r = getattr(client, method)(path)
    assert r.status_code == status
    assert r.json()["code"] == status
    assert r.json()["request_id"] == r.headers["x-request-id"]
    if status == 405:
        assert "GET" in r.headers["allow"]


def test_validation_is_sanitized(client):
    r = client.post("/api/v1/users", json={"email": "secret-invalid", "name": ""})
    assert r.status_code == 422
    assert "secret-invalid" not in r.text
    assert r.json()["data"]["errors"]


def test_openapi_documents_envelope(client):
    r = client.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    assert "openapi" in schema and "code" not in schema
    response = schema["paths"]["/api/v1/users"]["post"]["responses"]
    assert {"201", "409", "422", "503", "500"} <= response.keys()
    error_ref = response["422"]["content"]["application/json"]["schema"]["$ref"]
    assert "ApiResponse" in error_ref


def test_unhandled_error_is_sanitized(client):
    @client.app.get("/explode")
    async def explode():
        raise RuntimeError("postgresql://admin:password@localhost/private")

    r = client.get("/explode")
    assert r.status_code == 500
    assert r.json()["message"] == "Internal server error"
    assert "password" not in r.text
    assert r.json()["request_id"] == r.headers["x-request-id"]


def test_unhandled_exception_does_not_escape_to_server_logs():
    from fastapi.testclient import TestClient

    from app.main import create_app

    app = create_app()

    @app.get("/safe-error")
    async def error():
        raise RuntimeError("secret-database-password")

    with TestClient(app, raise_server_exceptions=True) as c:
        assert c.get("/safe-error").status_code == 500


def test_request_ids_are_generated(client):
    a = client.get("/api/v1/health/live", headers={"X-Request-ID": "untrusted"})
    b = client.get("/api/v1/health/live")
    assert a.headers["x-request-id"] != "untrusted"
    assert a.headers["x-request-id"] != b.headers["x-request-id"]
