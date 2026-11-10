from datetime import UTC, datetime
from functools import lru_cache
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, Index, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


@lru_cache(maxsize=16)
def document_model(dimension: int):
    class DocumentBase(DeclarativeBase):
        pass

    class Document(DocumentBase):
        __tablename__ = "pythonagent_documents"
        __table_args__ = {"schema": "public"}
        id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
        document: Mapped[str] = mapped_column(Text)
        metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
        embedding = mapped_column(Vector(dimension), nullable=False)
        created_at: Mapped[datetime] = mapped_column(
            DateTime(timezone=True), default=lambda: datetime.now(UTC)
        )

    if dimension <= 2000:
        Index(
            "ix_pythonagent_documents_embedding_hnsw",
            Document.embedding,
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        )
    return Document
