from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.embeddings import OllamaEmbeddings
from app.modules.documents.models import document_model
from app.modules.documents.schemas import DocumentCreate, DocumentRead, SearchHit, SearchRequest


class DocumentService:
    def __init__(self, session: AsyncSession, embeddings: OllamaEmbeddings, dimension: int):
        self.session = session
        self.embeddings = embeddings
        self.model = document_model(dimension)

    @staticmethod
    def serialize(doc):
        return {
            "id": doc.id,
            "text": doc.document,
            "metadata": doc.metadata_json,
            "created_at": doc.created_at,
        }

    async def create(self, payload: DocumentCreate) -> DocumentRead:
        vector = await self.embeddings.embed(payload.text)
        document = self.model(
            document=payload.text, metadata_json=payload.metadata, embedding=vector
        )
        self.session.add(document)
        await self.session.commit()
        await self.session.refresh(document)
        return DocumentRead(**self.serialize(document))

    async def search(self, payload: SearchRequest) -> list[SearchHit]:
        vector = await self.embeddings.embed(payload.query)
        await self.session.execute(
            text("SELECT set_config('hnsw.ef_search', :candidates, true)"),
            {"candidates": str(max(100, payload.limit * 2))},
        )
        distance = self.model.embedding.cosine_distance(vector).label("distance")
        rows = await self.session.execute(
            select(self.model, distance).order_by(distance, self.model.id).limit(payload.limit)
        )
        return [
            SearchHit(**self.serialize(doc), score=max(-1.0, min(1.0, 1 - float(dist))))
            for doc, dist in rows.all()
        ]
