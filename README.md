# Scientific Trend Miner

A full-stack **argument-centric scientific knowledge discovery pipeline** powered by Large Language Models (LLMs).  
The system processes large collections of scientific PDFs and transforms them into a structured, explainable knowledge graph of **arguments, entities, relations, concepts, and hypotheses**, stored in Neo4j and indexed in Elasticsearch, and visualised interactively via the GraphVisor frontend.

---

## Overview
**Scientific Trend Miner** is a research prototype developed to support the analysis of scientific literature collections using local AI-based methods.
The system is designed to process a corpus of scientific publications and short technical memos, extract structured textual and metadata information, generate semantic representations, identify thematic clusters, analyse topic evolution over time, and support the extraction of relevant scientific ideas.

This prototype implements an end-to-end pipeline for:

- PDF ingestion and document preprocessing  
- OCR-based text extraction for scanned documents  
- Semantic segmentation and chunking  
- LLM-based argument extraction and classification  
- Entity, relation, and concept induction  
- Knowledge graph construction (Neo4j)  
- Semantic indexing (Elasticsearch)  
- Explainable hypothesis generation from structured scientific knowledge  
- Interactive corpus visualisation (GraphVisor)

The core design principle is **argument-centric representation**, where scientific reasoning is modeled explicitly through argumentative structures rather than raw text chunks.

---

## Key Features

- 📄 Document ingestion pipeline for PDF, DOCX, and scanned documents  
- 🔍 OCR integration using external PaddleOCR-based service  
- ✂️ Semantic chunking for long document segmentation  
- 🧠 LLM-based argument extraction and classification (causal, mechanistic, evidence, etc.)  
- 🔗 Structured knowledge graph construction in Neo4j  
- 📊 Concept induction and normalization across the full corpus  
- ⚡ Vector-based semantic search using Elasticsearch  
- 🧪 Explainable hypothesis generation grounded in argument clusters  
- 🔁 Full traceability from hypothesis → arguments → source documents  
- 🗺️ Interactive graph/map/timeline visualisation via GraphVisor  

---

## System Requirements

### Software Requirements

- Python 3.9+
- Node.js 18+ (for the frontend)
- Neo4j (Bolt: `bolt://localhost:7687`)
- Elasticsearch (HTTP: `http://localhost:9201`)
- Local LLM server (e.g. Ollama or custom endpoint):
  - `http://localhost:11435/api/generate` — argument extraction / hypothesis generation
  - `http://localhost:11436` — topic labeling (default model: `gemma4:31b`)

### External Services

- OCR Service (UPM PaddleOCR-based):  
  `https://wiig.dia.fi.upm.es/services/ocr`

- Semantic Chunking Service (UPM):  
  `https://wiig.dia.fi.upm.es/services/chunking/doc`

- Abstract generation (UPM):  
  `http://127.0.0.1:8087/services/abstractions/generate`

- **BGE-M3 Vectorizer** (local embedding service):  
  `http://localhost:8089/embed`  
  Required for `embed_corpus.py`, `embed_concepts.py`, and `embed.py`.

- **Semantic Scholar API** (citation enrichment):  
  `https://api.semanticscholar.org/graph/v1/paper/search`  
  No API key required; rate-limited. Used by `enrich_citations.py`.

- **OpenAlex API** (citation enrichment fallback):  
  `https://api.openalex.org/works`  
  No API key required; uses polite pool when an email is set in `backend/scripts/config.py`.

---

## Installation

### 1. Clone repository

```bash
git clone https://github.com/oeg-upm/scientific-trend-miner.git
cd scientific-trend-miner
```

### 2. Backend — create virtual environment and install dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 3. Frontend — install dependencies and build

```bash
cd frontend
npm install
npm run build
```

The production build is output to `frontend/dist/`. The included `run.sh` script starts a service that proxies this directory.

```bash
./frontend/run.sh
```

---

## Usage

### 1. Run full document processing pipeline

Processes a folder of PDFs and generates structured outputs (arguments, concepts, relations, JSON exports):

```bash
python backend/main.py --path ./path/to/pdf_folder
```

### 2. Build Neo4j knowledge graph

```bash
python backend/scripts/main_neo4j.py --path ./path/to/pdf_output_folder
```

### 3. Generate hypotheses

Hypotheses are generated from concept-centered argument retrieval in Neo4j:

```bash
python backend/scripts/hypothesis_generation.py
```

### 4. Prepare corpus for the frontend

The `run.sh` script in `backend/scripts/` runs the full corpus enrichment pipeline in one go: citation enrichment → document + concept embeddings → topic clustering. Requires the BGE-M3 vectorizer (`localhost:8089`) and Ollama (`localhost:11436`) to be running.

```bash
bash backend/scripts/run.sh --dataset <id>
```

The individual steps can also be run separately:

**Embed documents** — 1024-dim BGE-M3 embeddings per document:

```bash
python backend/scripts/embed_corpus.py --dataset <id>
# e.g. --dataset 112  →  reads frontend/src/data/corpus_112.json
```

**Embed concepts** — grounds concepts in document space via PCA:

```bash
python backend/scripts/embed_concepts.py --dataset <id>
```

Or run documents + concepts in a single pass:

```bash
python backend/scripts/embed.py --dataset <id>
```

**Cluster topics** — NMF clustering labeled by Ollama:

```bash
python backend/scripts/cluster_topics.py --dataset <id> --n-topics <n>
```

**Enrich citations** — citation counts via Semantic Scholar / OpenAlex:

```bash
python backend/scripts/enrich_citations.py --dataset <id>
```

---

## Repo Structure

```text
.
├── backend/
│   ├── main.py                          # Main pipeline orchestrator
│   ├── hypothesis_generation.py         # Hypothesis generation orchestrator
│   ├── scripts/
│   │   ├── main_neo4j.py               # Neo4j ingestion + hypothesis generation
│   │   ├── argument_extraction.py
│   │   ├── classification.py
│   │   ├── concepts.py
│   │   ├── graph_builder.py
│   │   ├── embed_corpus.py             # Document embeddings via BGE-M3
│   │   ├── embed_concepts.py           # Concept embeddings + PCA
│   │   ├── embed.py                    # Combined doc + concept embedding
│   │   ├── cluster_topics.py           # NMF topic clustering + Ollama labeling
│   │   ├── enrich_citations.py         # Citation counts via S2 / OpenAlex
│   │   ├── vectorizer_client.py        # HTTP client for BGE-M3 vectorizer
│   │   ├── openalex_client.py
│   │   ├── semanticscholar_client.py
│   │   ├── config.py                   # Paths, URLs, and defaults
│   │   └── run.sh                      # Full corpus enrichment pipeline (enrich → embed → cluster)
│   ├── utils/
│   │   ├── json_utils.py
│   │   └── merge_utils.py
│   ├── Prompts/                        # LLM prompt templates
│   ├── logs/
│   ├── output/                         # Pipeline outputs
│   ├── files/
│   └── requirements.txt
└── frontend/                           # GraphVisor interactive visualisation
    ├── src/
    │   ├── data/                       # Corpus JSON + embedding binaries
    │   ├── views/                      # CorpusView, DetailView, etc.
    │   ├── components/
    │   ├── graph/                      # D3 graph simulation modules
    │   └── store/                      # Global state
    ├── dist/                           # Production build (served by run.sh)
    ├── index.html
    ├── vite.config.ts
    ├── package.json
    └── run.sh                          # Starts the frontend service (proxies dist/)
```

---

## Configuration Notes

- Ensure all prompt templates in `backend/Prompts/` are available before execution.
- The local LLM endpoint for extraction must be running at `localhost:11435`.
- The Ollama endpoint for topic labeling must be running at `localhost:11436`.
- The BGE-M3 vectorizer must be running at `localhost:8089` for embedding scripts.
- Neo4j and Elasticsearch must be running before graph ingestion.
- External UPM services (OCR and chunking) must be reachable.

## The system produces:

- Extracted argument sets (JSON)
- Neo4j knowledge graph
- Elasticsearch index
- Corpus JSON with embeddings and topic clusters (consumed by the frontend)
- Generated hypotheses with:
  - Evidence traceability
  - Multi-dimensional scoring: novelty, plausibility, impact, creativity


## Confidentiality

Input documents may contain confidential or restricted scientific information. Users of this repository must ensure that all data processing complies with the corresponding confidentiality agreements and institutional policies.

## Acknowledgements

This work is developed by the Ontology Engineering Group and AI.nnovation Center at Universidad Politécnica de Madrid as part of a scientific and technical support activity for the Ruđer Bošković Institute.
