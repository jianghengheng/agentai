from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)
    app_name: str = "PythonAgent"
    app_env: str = "development"
    database_url: SecretStr = SecretStr("postgresql://postgres:postgres@127.0.0.1:5433/pythonagent")
    rag_database_url: SecretStr = SecretStr(
        "postgresql://postgres:postgres@127.0.0.1:5433/pythonagent"
    )
    ollama_base_url: str = "http://127.0.0.1:11434"
    embedding_model: str = "mxbai-embed-large:latest"
    embedding_dimension: int = Field(default=1024, ge=1, le=16000)
    db_timeout_seconds: int = Field(default=5, ge=1, le=60)
    ollama_timeout_seconds: int = Field(default=30, ge=1, le=300)

    @field_validator("database_url", "rag_database_url")
    @classmethod
    def postgres_only(cls, value: SecretStr) -> SecretStr:
        try:
            url = make_url(value.get_secret_value())
            if url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}:
                raise ValueError
            if not url.host or not url.database:
                raise ValueError
        except Exception:
            raise ValueError("A PostgreSQL URL with host and database is required") from None
        return value

    @field_validator("ollama_base_url")
    @classmethod
    def validate_ollama_url(cls, value: str) -> str:
        from urllib.parse import urlsplit

        url = urlsplit(value)
        if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.query:
            raise ValueError("A plain HTTP(S) Ollama base URL is required")
        return value.rstrip("/")
