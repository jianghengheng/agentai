from typing import Annotated

from fastapi import APIRouter, Depends, Request # pyright: ignore[reportMissingImports]
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.schemas import ApiResponse, success
from app.infrastructure.database import vector_session
from app.modules.documents.schemas import DocumentCreate, DocumentRead, SearchHit, SearchRequest
from app.modules.documents.service import DocumentService

router = APIRouter(prefix="/documents", tags=["文档向量"])
Session = Annotated[AsyncSession, Depends(vector_session)]


def service(request, session):
    return DocumentService(
        session, request.app.state.embeddings, request.app.state.settings.embedding_dimension
    )


@router.post(
    "",
    status_code=201,
    response_model=ApiResponse[DocumentRead],
    summary="生成向量并保存文档",
    operation_id="create_document",
)
async def create_document(request: Request, payload: DocumentCreate, session: Session):
    return success(request, await service(request, session).create(payload))


@router.post(
    "/search",
    response_model=ApiResponse[list[SearchHit]],
    summary="文档余弦相似度检索",
    operation_id="search_documents",
)
async def search_documents(request: Request, payload: SearchRequest, session: Session):
    return success(request, await service(request, session).search(payload))
