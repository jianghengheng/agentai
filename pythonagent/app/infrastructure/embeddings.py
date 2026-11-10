import math
import struct

import httpx

from app.core.config import Settings
from app.core.errors import AppError


def validate_vector(vector, dimension: int) -> list[float]:
    if not isinstance(vector, list) or len(vector) != dimension:
        raise ValueError("Embedding dimension mismatch")
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) for x in vector):
        raise ValueError("Embedding values must be numeric")
    try:
        values = [struct.unpack("f", struct.pack("f", float(x)))[0] for x in vector]
    except (OverflowError, struct.error):
        raise ValueError("Embedding values exceed float32 range") from None
    if not all(math.isfinite(x) for x in values) or not any(values):
        raise ValueError("Embedding must be finite and nonzero")
    return values


class OllamaEmbeddings:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client

    async def embed(self, text: str) -> list[float]:
        try:
            response = await self.client.post(
                self.settings.ollama_base_url + "/api/embed",
                json={"model": self.settings.embedding_model, "input": [text], "truncate": False},
                timeout=self.settings.ollama_timeout_seconds,
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("Invalid embedding response")
            vectors = payload.get("embeddings")
            if not isinstance(vectors, list) or len(vectors) != 1:
                raise ValueError("Invalid embedding response")
            return validate_vector(vectors[0], self.settings.embedding_dimension)
        except (httpx.HTTPError, ValueError, TypeError, OverflowError):
            raise AppError(
                503, "Embedding service unavailable or returned invalid vectors"
            ) from None
