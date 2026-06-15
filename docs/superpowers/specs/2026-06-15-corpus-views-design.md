# Corpus Tab — Three Views Design

**Date:** 2026-06-15
**Status:** Approved for planning

## Summary

The Corpus tab gains two new views alongside today's PCA scatter, switchable via a segmented control:

1. **Map** — the existing PCA scatter (essentially unchanged).
2. **Topics** — a grid of topic tiles derived by clustering document embeddings; each tile holds the documents in that topic as rounded mini-squares.
3. **Timeline** — a vertically split view: a document beeswarm on a year axis (top) above the existing corpus-stats stream graph (bottom), sharing one aligned x-axis.

A shared "representation" encoding (argument count / impact / uniform) drives dot size in Map and Timeline. **Impact** is a new citation-derived field. The pull-up "Corpus Statistics" drawer is removed; the stream graph lives permanently inside the Timeline view.

## Goals

- Three switchable corpus views sharing one selection state (linked highlighting).
- Replace the `page_count` size option with `impact`, backed by a new per-document `citations` field.
- Cluster documents into labeled topics from their embeddings.
- Relocate the corpus-stats stream graph into the Timeline view, axis-aligned with a document beeswarm.

## Non-Goals

- Fetching real citation data from an external API (the `citations` field is populated manually in the JSON for now).
- Changing the graph, detail, or discover tabs.
- Persisting the selected corpus view mode across sessions.

## Architecture

### Navigation & container

`CorpusView` becomes a shell that renders one of three sub-view components and owns the shared chrome (`ControlPanel`, tooltip, selection wiring).

- New store state: `corpusViewMode: 'map' | 'topics' | 'timeline'`, default `'map'` (preserves current behavior), with `setCorpusViewMode`.
- A segmented control rendered top-center of the canvas switches modes.
- Selection (`selectedDocumentIds`) stays in the store, so selecting in any view highlights in the others.

New/changed files:
- `src/store/useStore.ts` — add `corpusViewMode` + setter.
- `src/types/index.ts` — add `CorpusViewMode` type; change `SizeBy`; extend `DocNode`; add `Topic` type.
- `src/views/CorpusView/CorpusView.tsx` — becomes the shell/switcher.
- `src/views/CorpusView/CorpusViewSwitcher.tsx` — segmented control (new).
- `src/views/CorpusView/MapView.tsx` — extracted current scatter (wraps `useCorpusD3`).
- `src/views/CorpusView/TopicsView.tsx` — new grid view.
- `src/views/CorpusView/TimelineView.tsx` — new split view.

### Shared "representation" encoding

- `SizeBy` becomes `'argument_count' | 'impact' | 'uniform'` (drop `page_count`).
- Add `citations: number` to each document in `src/data/corpus_final_dat.json` (placeholder values now; replaced with real counts later). Add to `RawDoc` and surface `citations` on `DocNode`.
- **Impact = raw citation count.** When `sizeBy === 'impact'`, dot size scales on `d.citations`.
- The "Size by" control in `ControlPanel`/`CorpusView` lists arg count / impact / uniform. The min-filter slider follows the active non-uniform metric: min arguments or min citations.
- Applies to **Map** and **Timeline** dot size. **Topics** uses uniform tiles, so the size control is hidden in that mode.

### Map view

Today's PCA scatter, moved into `MapView.tsx`. Only change: the size encoding's `page_count` branch in `useCorpusD3.ts` becomes `impact` (reads `d.citations`).

### Topics grid view

- **Clustering:** k-means over the 1024-dim `doc_embbeding` vectors, computed once in `DataService` and cached, mirroring the existing `PCA_SCORES` IIFE. Add the `ml-kmeans` dependency. Adaptive cluster count: `k = clamp(round(sqrt(nDocs / 2)), 2, 12)`, additionally capped at `nDocs`.
- **Labeling:** each cluster is labeled from its member docs' most frequent `parent_concepts` (falling back to top `termCounts` terms if concepts are absent). One representative label per cluster; ties broken by total frequency.
- **Data:** each `DocNode` gets `topic_id: number`. `DataService` exposes `getTopics(): Promise<Topic[]>` where `Topic = { id: number; label: string; docIds: string[]; argCount: number }`.
- **Rendering:** uniform-size tiles in a responsive grid. Each tile shows the topic label, doc + argument counts, and its documents as rounded mini-squares colored by selection state (selected = `#ef476f`, unselected = `#74b9d6`).
- **Selection:** clicking a mini-square toggles that single doc (shift-click extends, consistent with Map's single/multi semantics); clicking the tile's parent container selects all docs in the topic. Hovering a mini-square shows the existing doc tooltip (`FloatingCard`).

### Timeline view

Vertically split (top ~ doc beeswarm, bottom ~ stats stream).

- **Top (beeswarm):** `d3.forceSimulation` where x is fixed to a year scale (`forceX` at `xScale(d.year)` with high strength, or pinned `fx`) and y is collision packing only (density — y carries no value meaning). Dot size = active representation. Click / shift-click / lasso / tooltip behavior identical to Map.
- **Bottom:** the existing `CorpusStatsPanel` stream graph, relocated here permanently.
- **Axis alignment:** both halves share one year x-scale and identical left/right horizontal padding so ticks line up. Extract the shared layout (year domain + horizontal padding) into a small helper consumed by both the beeswarm and `CorpusStatsPanel`. `CorpusStatsPanel` is refactored to accept an externally supplied x-domain and horizontal padding instead of computing its own.
- **Drawer removal:** the pull-up "Corpus Statistics" drawer and its open/close state are removed from `CorpusView` entirely. The stream graph renders only inside `TimelineView`.

### Data flow

`DataService` computes PCA scores, k-means topic assignments, and reads citations once at module load (all cached). All three sub-views consume the same `DocNode[]` and the shared store selection. `getDocuments()` returns docs carrying `topic_id` and `citations`; `getTopics()` returns the aggregated topic list.

## Testing

- Cluster-label derivation: given docs with known `parent_concepts`, the chosen label is the most frequent concept.
- `getTopics` aggregation: doc counts, arg counts, and `docIds` per topic are correct; every doc belongs to exactly one topic.
- Adaptive `k`: the clamp/cap formula yields valid k for small (5) and large (200) corpora.
- Impact → size mapping: `sizeBy === 'impact'` scales radius on `citations`; `uniform` ignores it.
- Beeswarm layout: deterministic given fixed input (seeded/iterated simulation), x positions match the year scale.
- Shared x-scale helper: beeswarm and stats stream receive identical domain + padding.

## Open Decisions (resolved)

- Stats stream lives only in Timeline (drawer removed). ✓
- Impact = raw citation count from a new JSON `citations` field. ✓
- Topics from k-means on embeddings; uniform tiles; docs as rounded mini-squares; select by square or tile. ✓
- Timeline y = beeswarm density (not value). ✓
- Default mode = Map; segmented control top-center. ✓
