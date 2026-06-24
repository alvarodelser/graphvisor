# Citation Enrichment Preprocessing — Design

**Date:** 2026-06-24
**Status:** Approved

## Purpose

Add a `citations` count to each paper in a GraphVisor corpus by looking up paper
titles against public scholarly APIs. The `citations` field is already typed
(`citations: number` in `src/types/index.ts`) and consumed by the `'impact'`
size-by mode. `corpus_5.json` already has the field populated, but
`corpus_112.json` and `corpus_165.json` are missing it. This work fills that gap
with a repeatable preprocessing script and removes the dataset-id constraint that
currently blocks new corpora (e.g. `165`) across the preprocessing toolchain.

## Background

- Papers are identified only by the `source` field, a freetext string of the form
  `"<Title> - <Journal>"` (e.g.
  `"Avoidance of inter-repeat recombination by sequence divergence and a mechanism of neutral evolution - Biochimie"`).
  There are no DOI / PMID / ArXiv identifiers in the corpus.
- Corpus files are JSON arrays of document objects. Existing preprocessing scripts
  (`embed_corpus.py`, `embed_concepts.py`, `cluster_topics.py`) follow a shared
  convention: `argparse` CLI, `--dataset` / `--input` / `--output` / `--dry-run`
  / `--force` flags, `httpx` for HTTP, and in-place writes with timestamped
  backups. Path helpers live in `config.py`.

## Scope

In scope:

1. New `enrich_citations.py` CLI script with a two-tier citation lookup.
2. New `semanticscholar_client.py` and `openalex_client.py` HTTP clients.
3. `config.py` additions: API endpoints, rate-limit constants, polite-pool email.
4. Remove the `choices=["5", "112"]` constraint from `--dataset` in the three
   existing preprocessing scripts so any numeric corpus id is accepted.
5. Unit tests for the pure helper functions.

Out of scope:

- Frontend / type changes (the `citations` field already exists and is consumed).
- Recording citation provenance in the data (source is logged at runtime only).
- Backfilling identifiers (DOI/PMID) into the corpus.

## Components

### `preprocessing/semanticscholar_client.py`

Mirrors the structure of the existing `vectorizer_client.py`.

- `S2Error(RuntimeError)` — raised on transport / HTTP failures.
- `search_paper(title: str) -> list[dict]` — calls
  `GET https://api.semanticscholar.org/graph/v1/paper/search`
  with query params `query=<title>`, `fields=title,citationCount`, `limit=5`.
  Returns the raw candidate list (the `data` array), or `[]` on no results.
- Conservative built-in rate limiting (no API key): ~1 request/second, with
  exponential backoff retry on HTTP 429. After a bounded number of retries the
  call raises `S2Error` (caller treats that paper as unmatched, does not abort).

### `preprocessing/openalex_client.py`

Mirrors the S2 client.

- `OpenAlexError(RuntimeError)` — raised on transport / HTTP failures.
- `search_paper(title: str) -> list[dict]` — calls
  `GET https://api.openalex.org/works`
  with params `filter=title.search:<title>`, `select=display_name,cited_by_count`,
  `per-page=5`, `mailto=<config email>` (the `mailto` opts into OpenAlex's faster
  "polite pool"). Returns the `results` array, or `[]` on no results.
- Same rate-limit + backoff posture as the S2 client.

### `preprocessing/config.py` additions

- `S2_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"`
- `OPENALEX_WORKS_URL = "https://api.openalex.org/works"`
- `OPENALEX_MAILTO = "a.fontecha.ser@gmail.com"` (polite-pool contact)
- `DEFAULT_CITATION_RATE_LIMIT_S = 1.0` (min seconds between requests)
- `CITATION_MATCH_THRESHOLD = 0.85` (min title similarity to accept)
- `CITATION_MAX_RETRIES = 3` (per-request retry budget on 429 / transport error)

The existing `corpus_path()` helper already builds a path from any id string, so
no path-helper change is needed for arbitrary dataset ids.

### `preprocessing/enrich_citations.py`

CLI entrypoint. `argparse` flags consistent with the existing scripts:

- `--dataset` — free-form numeric corpus id (no `choices` constraint).
- `--input` — explicit corpus JSON path (overrides `--dataset`).
- `--output` — output path (defaults to overwriting input in place).
- `--force` — re-fetch papers that already have a `citations` value.
- `--dry-run` — perform lookups and report, but do not write the corpus file.

Pure helper functions (unit-tested, no network):

- `clean_title(source: str) -> str` — strips the trailing `" - <Journal>"`
  suffix from the `source` field to produce a clean search title. Splits on the
  last `" - "` separator so titles containing internal hyphens are preserved.
  Returns the trimmed full string if no `" - "` separator is present.
- `best_match(query_title: str, candidates: list[dict], title_key: str) -> dict | None`
  — computes normalized title similarity between `query_title` and each
  candidate's `title_key` value using stdlib `difflib.SequenceMatcher` on
  lowercased, whitespace-normalized strings. Returns the highest-scoring
  candidate whose similarity is `>= CITATION_MATCH_THRESHOLD`, else `None`.
  Handles an empty candidate list by returning `None`.

## Data Flow

```
load corpus_<id>.json (JSON array)
  for each doc:
    if doc has "citations" and not --force: skip
    title = clean_title(doc["source"])

    s2_candidates = semanticscholar_client.search_paper(title)
    match = best_match(title, s2_candidates, "title")
    if match: doc["citations"] = match["citationCount"]   # matched via S2
    else:
      oa_candidates = openalex_client.search_paper(title)
      match = best_match(title, oa_candidates, "display_name")
      if match: doc["citations"] = match["cited_by_count"] # matched via OpenAlex
      else: unmatched.append(title)                        # no field written

  if not --dry-run: write corpus (timestamped backup, in place)
  print summary: matched-via-s2 / matched-via-openalex / skipped / unmatched
  print full unmatched-title list for manual review
```

`clean_title` and `best_match` are shared across both lookup tiers so matching
behavior is consistent regardless of source.

## Error Handling

- **Per-paper API failure** (429 exhausted, transport error, malformed
  response): the client raises its error; the main loop catches it, treats that
  paper as unmatched, logs it, and continues. One bad lookup never aborts the run.
- **Empty / missing citation count** in an otherwise-matched candidate: treated
  as no confident match for that tier (falls through to the next tier / unmatched).
- **No confident match in either tier**: leave the `citations` field absent
  (the frontend already tolerates a missing field) and add the title to the
  unmatched list.
- **Corpus file not found** for the given id: fail fast with a clear message
  (consistent with `resolve_paths` in the existing scripts).

## Existing-Script Changes

Remove `choices=["5", "112"]` from the `--dataset` argument in:

- `preprocessing/embed_corpus.py`
- `preprocessing/embed_concepts.py`
- `preprocessing/cluster_topics.py`

After removal, `--dataset` accepts any id string. Each script already validates
that the resolved `corpus_<id>.json` exists and exits with a clear "file not
found" message otherwise, so an invalid id produces a helpful error rather than
an opaque argparse rejection.

## Testing

Unit tests (no network), following the repo's existing test style:

- `clean_title`:
  - strips a trailing `" - Journal"` suffix
  - preserves titles that contain internal hyphens / dashes
  - returns the trimmed input when no `" - "` separator is present
- `best_match`:
  - accepts a near-identical candidate (above threshold)
  - rejects a dissimilar candidate (below threshold), returning `None`
  - returns `None` for an empty candidate list
  - selects the highest-scoring candidate when several are above threshold

## Usage

```
# Enrich the 165-paper corpus in place (with backup)
python preprocessing/enrich_citations.py --dataset 165

# Preview without writing
python preprocessing/enrich_citations.py --dataset 112 --dry-run

# Re-fetch everything, even papers that already have a count
python preprocessing/enrich_citations.py --dataset 5 --force
```
