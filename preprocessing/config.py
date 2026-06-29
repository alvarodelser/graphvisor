from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "src" / "data"

DEFAULT_VECTORIZER_URL = "http://localhost:8089/embed"
DEFAULT_BATCH_SIZE = 16
DEFAULT_TIMEOUT_S = 120.0
EXPECTED_EMBEDDING_DIM = 1024

DEFAULT_OLLAMA_URL = "http://localhost:11436"
DEFAULT_OLLAMA_MODEL = "gemma4:31b"

# Field name used throughout GraphVisor (intentional spelling).
EMBEDDING_FIELD = "doc_embbeding"

# Citation enrichment (enrich_citations.py).
S2_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
OPENALEX_WORKS_URL = "https://api.openalex.org/works"
OPENALEX_MAILTO = "a.fontecha.ser@gmail.com"  # opts into OpenAlex's polite pool
DEFAULT_CITATION_RATE_LIMIT_S = 1.0  # min seconds between citation API requests
CITATION_MATCH_THRESHOLD = 0.85  # min title similarity to accept a match
CITATION_MAX_RETRIES = 5  # per-request retry budget on 429 / transport error


CORPUS_PATH = DATA_DIR / "corpus.json"
HYPOTHESIS_PATH = DATA_DIR / "hypothesis.json"
DOC_EMBEDDINGS_PATH = DATA_DIR / "doc_embeddings.bin"
CONCEPT_EMBEDDINGS_PATH = DATA_DIR / "concept_embeddings.bin"
CONCEPTS_PATH = DATA_DIR / "concepts.json"
TOPICS_PATH = DATA_DIR / "topics.json"
