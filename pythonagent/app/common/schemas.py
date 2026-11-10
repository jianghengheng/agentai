from typing import Any

from fastapi import Request
from pydantic import BaseModel


class ApiResponse[T](BaseModel):
    code: int = 0
    message: str = "success"
    data: T | None = None
    request_id: str


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


def success(request: Request, data: Any) -> dict:
    return {"code": 0, "message": "success", "data": data, "request_id": request.state.request_id}


ERROR_RESPONSES = {
    status: {"model": ApiResponse[dict], "description": description}
    for status, description in {
        404: "资源不存在",
        409: "资源冲突",
        422: "请求参数校验失败",
        503: "依赖服务不可用",
        500: "内部错误",
    }.items()
}
