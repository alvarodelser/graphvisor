# Discover Pipeline: Document → Argument → Concept → Hypothesis

**Date:** 2026-06-19  
**Status:** Approved

## Overview

Implements a bidirectional filtering pipeline that links document selection to hypothesis discovery and back. Selecting documents surfaces relevant hypotheses in the Discover tab via argument→concept→hypothesis traversal. Selecting hypotheses in Discover then double-filters the argument graph in Explore to only arguments from selected docs that belong to the selected hypotheses' concepts.

---

## 1. Data Model Changes

### `Hypothesis` type (`src/types/index.ts`)

Add two required fields:

```ts
export interface Hypothesis {
  hypothesis: string
  concept: string    // top-level key from hypothesis_112.json; '' for flat-format datasets
  evidence: string   // argument ID (e.g. "a2648"); '' for flat-format datasets
  rationale?: string
  decision: 'ADVANCE' | 'BORDERLINE'
  scores: {
    novelty: number
    scientific_plausibility: number
    potential_impact: number
    commercial_potential: number
  }
}
```

### `normalizeHypotheses` (`src/data/dataset.ts`)

For the grouped format (`hypothesis_112.json` — `Record<string, RawHypothesis112[]>`), preserve the concept key and evidence field. For flat format (`hypothesis_5.json` — `Hypothesis[]`), default both to `''`.

The `RawHypothesis112` type gains `evidence: string` and `rationale?: string`.

---

## 2. DataService (`src/data/DataService.ts`)

### New method: `getConceptsForDocuments`

```ts
getConceptsForDocuments(
  docIds: string[],
  confThreshold: number,
  cosThreshold: number
): Promise<{ concept: string; score: number }[]>
```

Pipeline (all in-memory):
1. Resolve `docIds` to raw doc objects
2. For each doc, iterate `doc.data` where `arg.confidence >= confThreshold`
3. For each qualifying arg, iterate `concept_level.parent_concepts[i]` where `parent_concepts_cos[i] >= cosThreshold`
4. Accumulate per-concept: `conceptScore[concept] += parent_concepts_cos[i]`
5. Return array sorted descending by score

No network calls — all data is already in `rawDocs`.

### Existing `getHypotheses`

Unchanged in signature. Returns the full enriched list (with `concept` + `evidence`). Filtering is done in the view against the result of `getConceptsForDocuments`.

---

## 3. Store (`src/store/useStore.ts`)

Three additions to `AppState`:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `conceptSimilarityThreshold` | `number` | `0.85` | Min cosine similarity for a concept mapping to count toward a concept's aggregate score |
| `conceptAggregateThreshold` | `number` | `1.0` | Min aggregate score for a concept to surface its hypotheses |
| `discoveredHypothesisCount` | `number` | `0` | Count of hypotheses currently passing all filters; written by DiscoverView, read by Shell for the badge |

Setters: `setConceptSimilarityThreshold`, `setConceptAggregateThreshold`, `setDiscoveredHypothesisCount`.

The existing `filters.minConfidence` (default `0.8`) is reused as the argument confidence threshold — no new field needed.

---

## 4. DiscoverView (`src/views/DiscoverView/DiscoverView.tsx`)

### Filtering logic

```
selectedDocumentIds + minConfidence + conceptSimilarityThreshold
  → getConceptsForDocuments()
  → activeConceptScores: Map<concept, score>
  → filter hypotheses where activeConceptScores.get(h.concept) >= conceptAggregateThreshold
  → call setDiscoveredHypothesisCount(filtered.length)
```

Triggered by `useEffect` on `[selectedDocumentIds, minConfidence, conceptSimilarityThreshold, conceptAggregateThreshold]`.

When `selectedDocumentIds` is empty: show all hypotheses unfiltered (current behaviour preserved).

### ControlPanel

Added FAB (bottom-left, same `ControlPanel` component as CorpusView) with one section — **Filters**:

- **Argument confidence** — range slider `0–1` step `0.05`, bound to `filters.minConfidence` via `setFilters`
- **Concept similarity** — range slider `0–1` step `0.05`, bound to `conceptSimilarityThreshold`
- **Concept aggregate score** — range slider `0–10` step `0.5`, bound to `conceptAggregateThreshold`

Each slider displays its current value and a brief label. No legend section needed for this view.

### DiscoverListItem

Add a small concept tag above/below the hypothesis text showing `hypothesis.concept` when non-empty. Styled as a muted violet pill to match the concept colour used in the corpus map.

---

## 5. GraphView Double-Filter (`src/views/GraphView/GraphView.tsx`)

When `selectedHypothesisIds` is non-empty:
1. Resolve the set of concept labels: `hypothesisConceptLabels = new Set(hypotheses.filter(h => selectedHypothesisIds.includes(h.hypothesis)).map(h => h.concept))`
2. After blobs are loaded, additionally filter: `blobs.filter(b => b.parent_concepts.some(c => hypothesisConceptLabels.has(c)))`
3. This filtered blob set becomes the initial scope passed to `ConceptHierarchy`

`GraphView` already has access to `blobs`; it needs access to `selectedHypothesisIds` (already in store) and the loaded hypothesis list (fetched via `dataService.getHypotheses()` on mount, cached).

When `selectedHypothesisIds` is empty, behaviour is unchanged (all blobs from selected docs).

---

## 6. Shell Badges (`src/components/Shell/Shell.tsx`)

| Tab | Before | After |
|-----|--------|-------|
| Select | `selectedDocumentIds.length` | unchanged |
| Discover | `selectedDocumentIds.length` | `discoveredHypothesisCount` (from store) |
| Explore | `selectedHypothesisIds.length` | unchanged |

The Discover badge now reads from `discoveredHypothesisCount` (set by DiscoverView). Badge is shown when `discoveredHypothesisCount > 0` regardless of whether docs are selected, so it also reflects the total count when no filter is active.

---

## 7. Files Changed

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `concept`, `evidence`, `rationale?` to `Hypothesis` |
| `src/data/dataset.ts` | Update `normalizeHypotheses` + `RawHypothesis112` |
| `src/data/DataService.ts` | Add `getConceptsForDocuments` method |
| `src/store/useStore.ts` | Add 3 fields + setters |
| `src/views/DiscoverView/DiscoverView.tsx` | Filtering logic + ControlPanel |
| `src/views/DiscoverView/DiscoverListItem.tsx` | Concept tag |
| `src/views/GraphView/GraphView.tsx` | Double-filter blobs by hypothesis concepts |
| `src/components/Shell/Shell.tsx` | Update Discover badge source |

No new files. No changes to CSS files beyond what the ControlPanel already provides.

---

## 8. Behaviour Summary

```
[Select] Pick documents
    ↓ args filtered by minConfidence
    ↓ concepts filtered by conceptSimilarityThreshold
    ↓ concepts aggregated, filtered by conceptAggregateThreshold
[Discover] Matching hypotheses shown, concept tag on each card
    ↓ user selects 1+ hypotheses
[Explore] Graph shows only args from selected docs AND matching hypothesis concepts
    ↓ user drills into argument/entity/concept
[Detail] Full argument detail
```
