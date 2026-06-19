# GraphVisor preprocessing

Run these scripts after updating raw corpus or hypothesis JSON files under `src/data/`.

## Setup

```bash
cd preprocessing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Two services must be reachable before running the pipeline:

- **Vectorizer** (steps 1 & 2): BGE-M3 embedding server at `http://localhost:8089/embed`
- **Ollama** (step 3 only): LLM for topic labeling at `http://localhost:11436`

## Pipeline

Run the three scripts in order. Each step depends on the previous one's output.

```bash
python embed_corpus.py --dataset 112
python embed_concepts.py --dataset 112
python cluster_topics.py --dataset 112
```

| Step | Script | Reads | Writes / Modifies |
|------|--------|-------|-------------------|
| 1 | `embed_corpus.py` | `corpus_<id>.json` | `corpus_<id>_doc_embeddings.bin` |
| 2 | `embed_concepts.py` | `corpus_<id>.json`, `corpus_<id>_doc_embeddings.bin` | `corpus_<id>_concept_embeddings.bin`, `corpus_<id>_concepts.json` |
| 3 | `cluster_topics.py` | `corpus_<id>.json` | `corpus_<id>_topics.json`, `corpus_<id>.json` (adds `topic_id` per document) |

Both scripts that modify `corpus_<id>.json` in place create a timestamped `.bak` backup first.

---

## Scripts

### 1. `embed_corpus.py`

Generates 1024-d BGE-M3 vectors for each document using `abstract` (falling back to `source` + `year`) and stores them in a binary file. The JSON corpus is not modified except to strip any stale `doc_embbeding` inline fields.

```bash
# Embed corpus_112.json
python embed_corpus.py --dataset 112

# Embed corpus_5.json
python embed_corpus.py --dataset 5

# Custom paths
python embed_corpus.py --input ../src/data/corpus_112.json

# Re-embed everything even if binary already exists
python embed_corpus.py --dataset 112 --force

# Validate connectivity without writing output
python embed_corpus.py --dataset 112 --dry-run
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--vectorizer-url` | `http://localhost:8089/embed` | Vectorizer endpoint |
| `--batch-size` | `16` | Texts per request |
| `--timeout` | `120` | HTTP timeout (seconds) |
| `--normalize` | off | Request L2-normalized vectors |
| `--force` | off | Re-embed even if binary exists |
| `--skip-health-check` | off | Skip initial probe request |
| `--dry-run` | off | Compute but do not write files |

---

### 2. `embed_concepts.py`

Collects all unique concepts from `parent_concepts` fields in the corpus, fits a PCA on the document embedding space, and for each concept:

- Computes a **grounding ball** (centroid + RMS radius) from the documents that mention it
- Projects the centroid to 2D via PCA
- Embeds the concept name itself via the vectorizer

Outputs `corpus_<id>_concepts.json` (one object per concept with `concept`, `pca_x`, `pca_y`, `radius`) and `corpus_<id>_concept_embeddings.bin` (concept name vectors, same order as the JSON).

```bash
# Run for dataset 112 (requires corpus_112_doc_embeddings.bin)
python embed_concepts.py --dataset 112

# Re-embed all concept names even if cached
python embed_concepts.py --dataset 112 --force

# Validate connectivity without writing output
python embed_concepts.py --dataset 112 --dry-run
```

| Flag | Default | Purpose |
|------|---------|---------|
| `--vectorizer-url` | `http://localhost:8089/embed` | Vectorizer endpoint |
| `--batch-size` | `16` | Texts per request |
| `--timeout` | `120` | HTTP timeout (seconds) |
| `--normalize` | off | Request L2-normalized vectors |
| `--force` | off | Re-embed all concept names |
| `--skip-health-check` | off | Skip initial probe request |
| `--dry-run` | off | Compute but do not write files |
| `--output-bin` | auto | Override concept embeddings binary path |
| `--output-json` | auto | Override concepts JSON path |

---

### 3. `cluster_topics.py`

Builds a document-concept matrix weighted by argument confidence and cosine similarity, runs NMF to extract K topics, and labels each topic by querying Ollama with the top concepts and paper titles. If Ollama is unavailable the top 3 concept names are joined as a fallback label.

Writes `corpus_<id>_topics.json` and adds a `topic_id` field to every document in `corpus_<id>.json`.

```bash
# Run for dataset 112
python cluster_topics.py --dataset 112

# Specify number of topics explicitly
python cluster_topics.py --dataset 112 --n-topics 6

# Use a different Ollama model
python cluster_topics.py --dataset 112 --ollama-model qwen3:14b

# Compute without writing files
python cluster_topics.py --dataset 112 --dry-run
```

Default K is chosen by a heuristic on corpus size (2 topics for ≤5 docs, 3 for ≤20, 4 for ≤50, 5 otherwise).

| Flag | Default | Purpose |
|------|---------|---------|
| `--n-topics` | heuristic | Number of NMF components |
| `--ollama-url` | `http://localhost:11436` | Ollama base URL |
| `--ollama-model` | `gemma4:31b` | Model used for topic labeling |
| `--ollama-timeout` | `300` | HTTP timeout per label request (seconds) |
| `--output-topics` | auto | Override topics JSON output path |
| `--output-corpus` | in-place | Override corpus JSON output path |
| `--dry-run` | off | Compute but do not write files |

---

## Dataset switching in the app

After preprocessing, set the active dataset in `src/data/dataset.ts`:

```ts
export const DATASET = '112' as const
```

Both `corpus_<id>.json` and `hypothesis_<id>.json` for that id must exist and be compatible.
