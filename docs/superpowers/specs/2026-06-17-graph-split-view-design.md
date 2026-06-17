# Graph Split View — Design

**Date:** 2026-06-17
**Status:** Approved (brainstorm)

## Problem

The current `GraphView` packs all three node kinds — Entity, Argument (blob), Concept — into a single force graph. Entities form chains, arguments wrap them as blobs, and concepts orbit the cloud. With real data this tangles: crossing links between the three kinds, and no clean way to read "which arguments belong to which concept" or "which entities are shared across arguments." Clarity is lost.

We want to keep the existing graph (it is good at entity separation with concepts orbiting) but add a **second, complementary view** that approaches the same data top-down: start from concepts, drill into arguments, and read the entity relationships of a chosen scope without the rest of the corpus on screen.

## Goals

- Relocate the existing graph into a **sub-view** so it sits beside the new one under a switcher.
- Add a **Split View**: a left **visual concept→argument hierarchy** that **filters** a right **entity-relationship graph**.
- The right graph uses a **blob-first (Euler-style) layout**: argument blobs are primary; entities always sit inside their blob(s); blobs that share an entity **overlap** so the shared entity lives in the intersection.
- Honor that an argument belongs to **several concepts** while still presenting a readable hierarchy.

## Non-Goals

- No change to the existing graph's layout/behavior — it is simply relocated.
- No new backend/data work. Both views consume the existing `dataService.getGraph(selectedDocumentIds)` output (`nodes`, `edges`, `blobs`).
- No concept→sub-concept taxonomy. The data has no nested concepts; the hierarchy is exactly two levels (Concept → Argument).

## Data Facts (grounding)

- Each argument (`ArgumentBlob`) carries `parent_concepts: string[]` — a **ranked** list (top match first), plus `concept_id`. The rest of the app already treats `parent_concepts[0]` as *the* concept (the `Concept` node built in `DataService`).
- `graphModel` already computes everything the blob-first layout needs:
  - `argMembers` (arg → member entity ids), `entityArgs` (entity → arg ids)
  - `bridgeEntities` = **entities shared across arguments** (the entities that drive overlap)
  - `conceptArgs` (concept → arg ids), `argConcept` (arg → primary concept), `conceptLabels`
- `blobGeometry` already draws a hull around a blob's member entities; if a shared entity is a member of two blobs, both hulls enclose it and naturally overlap there.

## Architecture

### View shell — GraphView sub-switcher

`GraphView` gains a top center switcher (mirroring `CorpusViewSwitcher`):

- **⊙ Graph** — today's view, unchanged (the existing `useGraphD3` chain/concept-orbit layout).
- **⇆ Split** — the new split view.

A `graphViewMode: 'graph' | 'split'` flag is added to the store (mirroring `corpusViewMode`). The existing graph rendering moves into a `GraphCanvasView` component so `GraphView` becomes a thin shell: switcher + active sub-view + shared `ControlPanel`.

Both sub-views read from the same `selectedDocumentIds` → `getGraph` data already loaded in `GraphView`. Data fetch stays at the shell level and is passed down.

### Split view layout

```
+----------------------------+---------------------------------+
|  Concept ▸ Argument tree    |  Entity-relationship graph      |
|  (node-link, collapsible)   |  (blob-first / Euler overlap)   |
|  clicking nodes = filter -->|  shows only selected scope      |
+----------------------------+---------------------------------+
```

A new `SplitView` component owns a left/right flex container, the selection state that links them, and the shared filter set. Left and right are separate D3 visualizations.

### Left panel — `ConceptHierarchy` (new)

- **Shape:** node-link **collapsible tree**, Concept → Argument (D3 hierarchy / tidy tree, vertical scroll for many nodes).
- **Nodes:** concept nodes (color `#6366f1`), argument nodes (argument-blob styling, smaller).
- **Multi-parent handling (Option 1 — primary + secondary on demand):**
  - Each argument is placed **once**, under `parent_concepts[0]` (its top concept) — keeps a strict, readable tree consistent with the rest of the app.
  - On **hover/select** of an argument, its other concept memberships render as **faint dashed arcs** (`#F4A124`) to those concept nodes.
  - An **"include secondary memberships"** toggle: when on, selecting a concept also pulls in arguments where that concept is a non-primary match (uses full `parent_concepts`, not just `[0]`).
- **Interactions:**
  - Click a **concept** node → (a) **expand/collapse** its argument children in the tree, and (b) add/remove that concept from the **filter scope**.
  - Click an **argument** node → set the filter scope to just that argument's blob.
  - A small **filter/search input** narrows visible concepts/arguments by label.
- **Default state:** tree collapsed to concept level; nothing selected.

### Right panel — `blobFirstLayout` (new module) + reused renderer

- **Reuse:** `graphModel`, `blobGeometry`, `collapse`, the SVG rendering pipeline, `NodeFloatingCard`, and the shared `ControlPanel` filters (node types, min confidence, relation types). The right panel renders blobs + entities + entity-entity edges exactly as the existing graph does — only the **force layout** differs.
- **New `blobFirstLayout` (forces):**
  1. Each entity is pulled toward the centroid of **every** blob it belongs to → owned entities stay inside their hull.
  2. A **shared (bridge) entity** is pulled toward the centroids of all its blobs → it settles between them, dragging those hulls into **overlap**.
  3. Blobs sharing **no** entity feel no mutual attraction; soft collision keeps disjoint blobs from sitting on top of each other.
  4. Hulls drawn per-blob via existing `blobGeometry`; overlap is the visual signal of shared arguments.
- **Input is pre-filtered** by the tree's selected scope, so the canvas only ever holds the chosen concepts'/arguments' blobs and their entities.
- **Default state:** empty until the first concept/argument is selected on the left.

### Data flow

```
selectedDocumentIds
      │  getGraph()  (in GraphView shell)
      ▼
 { nodes, edges, blobs } ──► graphModel  (shared)
      │
      ▼
   SplitView
      ├─ ConceptHierarchy (left)
      │     emits  selectedScope = { conceptIds, argumentIds, includeSecondary }
      │
      └─ right graph
            filters blobs/entities by selectedScope
            runs blobFirstLayout
            renders via existing pipeline + ControlPanel filters
```

Selection state (`selectedScope`) lives in `SplitView`. Filtering is the link model: empty scope → empty right graph; concept(s) selected → those concepts' argument blobs + their entities; argument selected → that single blob.

## Components / Files

**New**
- `src/views/GraphView/GraphViewSwitcher.tsx` — ⊙ Graph | ⇆ Split switcher.
- `src/views/GraphView/GraphCanvasView.tsx` — extracted current graph (svg + `useGraphD3` wiring).
- `src/views/GraphView/SplitView.tsx` — left/right container + `selectedScope` state + filtering.
- `src/views/GraphView/ConceptHierarchy.tsx` + `useConceptHierarchyD3.ts` — left collapsible tree.
- `src/graph/blobFirstLayout.ts` (+ `.test.ts`) — the Euler-overlap force layout.

**Modified**
- `src/views/GraphView/GraphView.tsx` — becomes the shell (switcher + active sub-view + shared `ControlPanel`); keeps the data fetch.
- `src/store/useStore.ts` — add `graphViewMode` + setter.
- `src/types/index.ts` — add `GraphViewMode = 'graph' | 'split'`; a `SelectedScope` type if useful.
- `src/views/GraphView/useGraphD3.ts` — accept a layout strategy (existing vs blob-first) **or** keep `useGraphD3` as-is for the canvas view and give the right panel its own thin hook that drives `blobFirstLayout`. (Decide during planning; prefer the smaller change.)

## Testing

- `blobFirstLayout.test.ts`: owned entity converges inside its blob's hull; a shared entity converges into the overlap of its blobs; disjoint blobs do not overlap. Mirror the existing pure-function force tests in `src/graph/*.test.ts`.
- `ConceptHierarchy` model: building the two-level tree from blobs uses `parent_concepts[0]` for placement; secondary memberships resolved from full `parent_concepts`; "include secondary" widens a concept's argument set correctly.
- Filtering: given a `selectedScope`, the right-graph input contains exactly the expected blobs/entities (empty scope → empty).

## Open / Deferred

- Visual polish of the tree (radial vs tidy, label truncation) can be tuned during implementation; tidy vertical tree is the starting point.
- Whether concept circle size / argument node size encodes magnitude (entity count) — nice-to-have, not required for v1.
