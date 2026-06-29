# GraphVisor preprocessing

Run after updating raw `corpus.json` or `hypothesis.json` under `src/data/`.

## Setup

```bash
cd preprocessing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Two services must be reachable:

- **Vectorizer** (`embed.py`): BGE-M3 embedding server at `http://localhost:8089/embed`
- **Ollama** (`cluster_topics.py`): LLM for topic labeling at `http://localhost:11436`

## Running the pipeline

```bash
./run_enrichment.sh           # run all steps; skip steps whose outputs already exist
./run_enrichment.sh --force   # re-run everything from scratch
./run_enrichment.sh --dry-run # compute but do not write files
```

## Steps

| Step | Script | Reads | Writes |
|------|--------|-------|--------|
| 1 | `enrich_citations.py` | `corpus.json` | `corpus.json` (adds `citations` per doc) |
| 2 | `embed.py` | `corpus.json` | `doc_embeddings.bin`, `concept_embeddings.bin`, `concepts.json`, `corpus.json` (adds `pca_x`/`pca_y`) |
| 3 | `cluster_topics.py` | `corpus.json` | `topics.json`, `corpus.json` (adds `topic_id`) |

Each step is idempotent: it skips silently if its outputs already exist. Pass `--force` to re-run a step individually:

```bash
python enrich_citations.py --force
python embed.py --force
python cluster_topics.py --force
```

## Dataset files

Canonical file names (all under `src/data/`):

| File | Purpose |
|------|---------|
| `corpus.json` | Main corpus (modified in-place by steps 1-3) |
| `hypothesis.json` | Hypotheses |
| `doc_embeddings.bin` | Document embedding vectors |
| `concept_embeddings.bin` | Concept name embedding vectors |
| `concepts.json` | Concept grounding data (pca_x, pca_y, radius) |
| `topics.json` | NMF topic clusters |
