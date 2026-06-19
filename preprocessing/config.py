from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "src" / "data"

DEFAULT_VECTORIZER_URL = "http://localhost:8089/embed"
DEFAULT_BATCH_SIZE = 16
DEFAULT_TIMEOUT_S = 120.0
EXPECTED_EMBEDDING_DIM = 1024

DEFAULT_OLLAMA_URL = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "llama3"

# Field name used throughout GraphVisor (intentional spelling).
EMBEDDING_FIELD = "doc_embbeding"


def corpus_path(dataset: str) -> Path:
    return DATA_DIR / f"corpus_{dataset}.json"


def hypothesis_path(dataset: str) -> Path:
    return DATA_DIR / f"hypothesis_{dataset}.json"


def doc_embeddings_path(dataset: str) -> Path:
    return DATA_DIR / f"corpus_{dataset}_doc_embeddings.bin"


def concept_embeddings_path(dataset: str) -> Path:
    return DATA_DIR / f"corpus_{dataset}_concept_embeddings.bin"


def concepts_path(dataset: str) -> Path:
    return DATA_DIR / f"corpus_{dataset}_concepts.json"


def topics_path(dataset: str) -> Path:
    return DATA_DIR / f"corpus_{dataset}_topics.json"
