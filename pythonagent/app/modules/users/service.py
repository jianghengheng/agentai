from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.modules.users.models import User
from app.modules.users.schemas import UserCreate, UserRead


class UserService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, payload: UserCreate) -> UserRead:
        user = User(name=payload.name, email=str(payload.email).lower())
        self.session.add(user)
        try:
            await self.session.commit()
            await self.session.refresh(user)
        except IntegrityError as exc:
            await self.session.rollback()
            state = getattr(exc.orig, "sqlstate", None)
            sqlite_code = getattr(exc.orig, "sqlite_errorname", None)
            if state == "23505" or sqlite_code == "SQLITE_CONSTRAINT_UNIQUE":
                raise AppError(409, "Email already exists") from None
            raise
        return UserRead.model_validate(user)

    async def list(self, page: int, page_size: int) -> list[UserRead]:
        users = await self.session.scalars(
            select(User)
            .order_by(User.created_at.desc(), User.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return [UserRead.model_validate(u) for u in users]
