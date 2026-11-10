from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException


class AppError(Exception):
    def __init__(self, status_code: int, message: str, data: Any = None):
        self.status_code = status_code
        self.message = message
        self.data = data


def error_response(request: Request, status: int, message: str, data=None, headers=None):
    request_id = request.state.request_id
    return JSONResponse(
        status_code=status,
        content={"code": status, "message": message, "data": data, "request_id": request_id},
        headers={**(headers or {}), "X-Request-ID": request_id},
    )


def register_handlers(app: FastAPI):
    @app.exception_handler(AppError)
    async def business_error(request, exc):
        return error_response(request, exc.status_code, exc.message, exc.data)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        errors = [
            {"loc": list(e["loc"]), "type": e["type"], "message": "Invalid value"}
            for e in exc.errors()
        ]
        return error_response(request, 422, "Validation error", {"errors": errors})

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        from http import HTTPStatus

        return error_response(
            request, exc.status_code, HTTPStatus(exc.status_code).phrase, headers=exc.headers
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, exc):
        import logging

        logging.getLogger("pythonagent").warning(
            "database_error request_id=%s type=%s", request.state.request_id, type(exc).__name__
        )
        return error_response(request, 503, "Database unavailable")

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        import logging

        logging.getLogger("pythonagent").error(
            "unexpected_error request_id=%s type=%s", request.state.request_id, type(exc).__name__
        )
        return error_response(request, 500, "Internal server error")
