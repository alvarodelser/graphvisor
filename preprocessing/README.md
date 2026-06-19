# GraphVisor preprocessing

Run these scripts after updating raw corpus or hypothesis JSON files under `src/data/`.

## Setup

```bash
cd preprocessing
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Ensure the local vectorizer container is running and reachable at `http://localhost:8089/embed`.

## Scripts

### 1. `embed_corpus.py` (required for corpus map / topics views)

Generates `doc_embbeding` (1024-d BGE-M3 vectors) for each document using the document `abstract`, falling back to `source` + `year` when no abstract is present.

```bash
# Embed corpus_112.json in place (creates a timestamped .bak backup first)
python embed_corpus.py --dataset 112

# Embed corpus_5.json
python embed_corpus.py --dataset 5

# Custom paths
python embed_corpus.py --input ../src/data/corpus_112.json --output ../src/data/corpus_112.json

# Re-embed everything even if vectors already exist
python embed_corpus.py --dataset 112 --force

# Validate vectorizer connectivity without writing output
python embed_corpus.py --dataset 112 --dry-run
```

Environment overrides:

| Flag | Default | Purpose |
|------|---------|---------|
| `--vectorizer-url` | `http://localhost:8089/embed` | Vectorizer endpoint |
| `--batch-size` | `16` | Texts per request |
| `--timeout` | `120` | HTTP timeout (seconds) |
| `--normalize` | off | Request L2-normalized vectors |

## Dataset switching in the app

After preprocessing, set the active dataset in `src/data/dataset.ts`:

```ts
export const DATASET = '112' as const
```

Both `corpus_<id>.json` and `hypothesis_<id>.json` for that id must exist and be compatible.
