"""Worker settings, read from the environment (services/.env via compose)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    neo4j_uri: str = "bolt://graphvisor-neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = ""

    vectorizer_url: str = "http://vectorizer:8089/embed"
    vectorizer_model: str = "bge-m3"
    vectorizer_batch_size: int = 12
    vectorizer_timeout_s: float = 600.0
    embedding_dim: int = 1024

    input_dir: Path = Path("/input")

    openalex_mailto: str = ""
    citation_rate_limit_s: float = 1.0   # min seconds between citation API requests
    citation_max_retries: int = 5        # per request, on 429 / transport errors
    citation_match_threshold: float = 0.85  # min title similarity to accept a match

    @property
    def schema_path(self) -> Path:
        return self.input_dir / "document.schema.json"


@lru_cache
def settings() -> Settings:
    return Settings()
