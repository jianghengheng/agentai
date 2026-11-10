from fastapi import APIRouter, Request

from app.common.schemas import ApiResponse, success
from app.core.errors import AppError

router = APIRouter(prefix="/health", tags=["健康检查"])


@router.get(
    "/live",
    response_model=ApiResponse[dict[str, str]],
    summary="进程存活检查",
    operation_id="health_live",
)
async def live(request: Request):
    return success(request, {"status": "ok"})


@router.get(
    "/ready",
    response_model=ApiResponse[dict[str, str]],
    summary="数据库、扩展和项目表就绪检查",
    operation_id="health_ready",
)
async def ready(request: Request):
    statuses = await request.app.state.databases.check()
    if any(value != "ok" for value in statuses.values()):
        raise AppError(503, "Dependencies are not ready", statuses)
    return success(request, statuses)
