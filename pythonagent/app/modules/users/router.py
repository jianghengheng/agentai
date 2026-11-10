from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.schemas import ApiResponse, success
from app.infrastructure.database import business_session
from app.modules.users.schemas import UserCreate, UserRead
from app.modules.users.service import UserService

router = APIRouter(prefix="/users", tags=["用户"])
Session = Annotated[AsyncSession, Depends(business_session)]


@router.post(
    "",
    response_model=ApiResponse[UserRead],
    status_code=201,
    summary="创建用户",
    operation_id="create_user",
)
async def create_user(request: Request, payload: UserCreate, session: Session):
    return success(request, await UserService(session).create(payload))


@router.get(
    "",
    response_model=ApiResponse[list[UserRead]],
    summary="分页查询用户",
    operation_id="list_users",
)
async def list_users(
    request: Request,
    session: Session,
    page: Annotated[int, Query(ge=1, le=100000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return success(request, await UserService(session).list(page, page_size))
