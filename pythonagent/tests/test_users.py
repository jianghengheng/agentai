import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def test_existing_user_mapping():
    from sqlalchemy import Text

    from app.modules.users.models import User

    assert User.__table__.fullname == "public.User"
    assert User.created_at.property.columns[0].name == "createdAt"
    assert isinstance(User.id.property.columns[0].type, Text)
    assert User.name.property.columns[0].nullable


async def test_list_existing_text_ids_and_nullable_names(database):
    from datetime import UTC, datetime

    from sqlalchemy import text

    from app.modules.users.service import UserService

    async with database() as session:
        await session.execute(
            text(
                'INSERT INTO "User" (id,email,name,"createdAt") VALUES (:id,:email,:name,:created)'
            ),
            {
                "id": "legacy-non-uuid-id",
                "email": "legacy@example.com",
                "name": None,
                "created": datetime.now(UTC).isoformat(),
            },
        )
        await session.commit()
        page = await UserService(session).list(page=1, page_size=20)
        assert len(page) == 1
        assert page[0].id == "legacy-non-uuid-id"
        assert page[0].name is None
        assert page[0].created_at is not None


@pytest.fixture
async def database():
    from app.modules.users.models import UserBase

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", execution_options={"schema_translate_map": {"public": None}}
    )
    async with engine.begin() as conn:
        await conn.run_sync(UserBase.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


async def test_create_list_duplicate(database):
    from app.core.errors import AppError
    from app.modules.users.schemas import UserCreate
    from app.modules.users.service import UserService

    async with database() as session:
        service = UserService(session)
        created = await service.create(UserCreate(name="Alice", email="alice@example.com"))
        assert created.name == "Alice"
        assert created.email == "alice@example.com"
        page = await service.list(page=1, page_size=10)
        assert len(page) == 1 and page[0].id == created.id
        with pytest.raises(AppError) as exc:
            await service.create(UserCreate(name="Again", email="alice@example.com"))
        assert exc.value.status_code == 409
        assert await service.list(page=2, page_size=10) == []


def test_pagination_rejects_invalid_boundaries():
    from app.main import create_app

    with TestClient(create_app()) as client:
        for url in ["?page=0", "?page_size=101", "?page_size=-1"]:
            assert client.get("/api/v1/users" + url).status_code == 422
