import logging
from uuid import uuid4

from starlette.requests import Request

from app.core.errors import error_response


class RequestIDMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request_id = str(uuid4())
        scope.setdefault("state", {})["request_id"] = request_id
        started = False

        async def send_with_id(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = [
                    (k, v) for k, v in message.get("headers", []) if k.lower() != b"x-request-id"
                ]
                message["headers"] = headers + [(b"x-request-id", request_id.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception as exc:
            logging.getLogger("pythonagent").error(
                "unexpected_error request_id=%s type=%s", request_id, type(exc).__name__
            )
            if started:
                # A stream/background failure cannot replace already-sent headers.
                # Re-raise only a sanitized exception so the server closes the connection.
                safe_error = RuntimeError("Response failed after headers were sent")
            else:
                response = error_response(Request(scope), 500, "Internal server error")
                await response(scope, receive, send_with_id)
                return
        else:
            return
        # Outside the except block to avoid retaining the original exception context.
        raise safe_error from None
