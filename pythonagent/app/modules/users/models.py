from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class UserBase(DeclarativeBase):
    pass


class User(UserBase):
    __tablename__ = "User"
    __table_args__ = {"schema": "public"}
    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str] = mapped_column(Text, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        "createdAt", DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
