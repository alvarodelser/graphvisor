# GraphVisor — Design Specification
**Date:** 2026-05-28  
**Status:** Approved for implementation planning

---

## 1. Project Overview

GraphVisor is a single-page React + D3.js web application for exploring a corpus of ~200 scientific documents (20–30 pages each). The backend extracts arguments, entities, and concepts from each document and stores them in a Neo4j graph database. The frontend lets researchers:

1. Visualise the document corpus by embedding (UMAP/PCA scatter)
2. Select a subset of documents and explore their extracted knowledge graph
3. Drill into a single argument to see its reach across the whole corpus

---

## 2. Data Model

Full schema at `docs/neo4j-schema.md`.

### Node Types

| Type | Shape (graph) | Color | Key properties |
|---|---|---|---|
| `Argument` | Rounded square | Dark navy `#073b4c` | `argument_id`, `full_argument`, `argument_type`, `reasoning`, `confidence` |
| `Entity` | Circle | Mid blue `#118ab2` | `name`, `reasoning`, `confidence`, `epistemic_strength`, `source_argument_id` |
| `Concept` | Diamond | Light blue `#74b9d6` | `name`, `description`, `confidence[]`, `concept_arg_id` |
| `Document` | Circle (corpus view) | Red `#ef476f` unselected / Amber ring `#F4A124` selected | `id`, `title`, `embedding` (2D pre-computed), `page_count` |

> **Schema gap:** `Argument` nodes currently have no `document_id` field. A `source_document_id` property (or a `Document` node type with a `HAS_ARGUMENT` relationship) must be added to the extraction pipeline before the document-selection-to-graph flow can work.

### Relationship Types

**Structural** (no properties — render as faint navy, low opacity):
- `HAS_SUBJECT`, `HAS_OBJECT` — Argument → Entity
- `HAS_CONCEPT` — Argument → Concept

**Semantic** (Argument → Argument, all carry `confidence: Double` and `relation_type: String`):

| Group | Edge color | Relations |
|---|---|---|
| Positive | Teal `#06d6a0` | `SUPPORTS`, `REVEALS`, `INCREASES`, `CORRELATES_WITH` |
| Negative | Pink `#ef476f`, dashed | `CONTRADICTS`, `INHIBITS` |
| Causal | Yellow `#ffd166` | `CAUSES`, `INDUCES`, `MAY_CAUSE`, `DESCRIBES`, `ASSOCIATED_WITH`, `IS_DEFINED_AS` |

Edge stroke-width encodes confidence (thicker = higher confidence).

---

## 3. Visual Design System

### Color Palette

| Role | Value | Used for |
|---|---|---|
| Navy | `#073b4c` | UI chrome: logo, active tab, primary buttons, Argument nodes |
| Amber | `#F4A124` | UI accent: selected state, CTAs, sliders, active filters |
| Pink-red | `#ef476f` | Unselected corpus dots, Entity nodes, CONTRADICTS/INHIBITS edges |
| Teal | `#06d6a0` | Positive relation edges |
| Mid blue | `#118ab2` | Entity nodes, card border glow |
| Light blue | `#74b9d6` | Concept nodes |
| Yellow | `#ffd166` | Causal relation edges |

**Rule:** Saturated palette colors are reserved for data encoding only. The UI chrome uses only navy and amber.

### Card Style

All panels and floating cards share one CSS system — no dark cards:

```css
/* White card (main panels, floating detail) */
.card {
  border-radius: 12px;
  background: #ffffff;
  box-shadow:
    0 0 0 1px  rgba(17, 138, 178, 0.28),   /* hairline border */
    0 0 4px 0px rgba(17, 138, 178, 0.18),  /* 2–3px tight border glow */
    0 2px 6px   rgba(7, 59, 76,  0.07),    /* close lift shadow */
    0 10px 28px rgba(7, 59, 76,  0.09);    /* distant elevation */
}

/* Mid card (sidebar sections, secondary panels) */
.card-mid {
  border-radius: 12px;
  background: #f4f7fa;
  box-shadow:
    0 0 0 1px  rgba(17, 138, 178, 0.22),
    0 0 4px 0px rgba(17, 138, 178, 0.13),
    0 2px 6px   rgba(7, 59, 76,  0.06),
    0 10px 28px rgba(7, 59, 76,  0.08);
}
```

The glow stays within ~2–3px of the border (`blur: 4px, spread: 0`). Card interiors are pure white/light grey — no inner gradient.

### Typography & Spacing

- Section labels: `9px`, `font-weight: 700`, `letter-spacing: 0.08em`, `text-transform: uppercase`, `color: #073b4c`, `opacity: 0.55`
- Body text: `system-ui`, `10–12px`
- Page background: `#e8edf2`
- Canvas background: `#fafbfc`

---

## 4. Application Shell

### Navigation

Single-page app. Three views laid out as a conceptual horizontal sequence:

```
Corpus  →  Graph  →  Detail
```

**Tab strip** in the top bar: always visible, always clickable. The active tab underlines in navy. The Graph tab shows a badge with the current selection count once documents are selected. The Detail tab is greyed out until a node is clicked in the Graph view.

**Contextual CTA** floats in the top-right of the top bar — appears only when a meaningful next step exists:
- On Corpus with ≥1 doc selected → `"View Graph →"`
- On Graph with a node selected → `"Open Detail →"`
- On Detail → no CTA

**Slide animation:** switching views triggers a horizontal CSS transform transition (left-to-right or right-to-left depending on direction), giving the feel of a horizontal page sequence without actual scroll.

### Top Bar

```
[GRAPHVISOR logo] [Corpus] [Graph ×12] [Detail (dim)]          [View Graph →]
```

### Filter Rail (all views)

A 44px icon strip on the left edge. Each icon represents a filter group. Clicking an icon expands that section inline (160px panel); clicking another collapses the first. Only one section open at a time. Content of the rail changes per view (see individual view sections).

### Status Bar

A 28px navy bar at the bottom of every view showing the current global state (selection count, active projection, confidence threshold, etc.) as small chips. Always visible.

---

## 5. Data Layer

All data access is abstracted behind a `DataService` interface. The service is swappable without touching the UI:

```
Phase 1 (now):     Mock JSON fixtures
Phase 2 (later):   Direct Neo4j Bolt queries (neo4j-driver)
Phase 3 (if needed): REST API
```

The `DataService` exposes:
- `getDocuments()` → `Document[]` (id, title, umap_x, umap_y, pca_x, pca_y, argument_count, page_count)
- `getGraph(documentIds: string[])` → `{ nodes: Node[], edges: Edge[] }`
- `getArgumentDetail(argumentId: string)` → `{ argument, relations, sources }`

Document embeddings (2D coordinates) are pre-computed server-side. The frontend receives ready-to-plot `(x, y)` pairs — no dimensionality reduction in the browser.

### State Management

Global state via **Zustand**:
- `selectedDocumentIds: string[]` — persists across tab switches
- `selectedNodeId: string | null` — the clicked node in Graph view
- `activeView: 'corpus' | 'graph' | 'detail'`
- `filters: { nodeTypes, minConfidence, relationGroups }` — persists across view switches

---

## 6. Corpus View

The landing view. Shows all 200 documents as a scatter plot in embedding space.

### Canvas

D3 zoom + pan on an SVG. Each document is a circle:
- **Unselected:** `#ef476f`, radius scales with argument count (min 4px, max 9px)
- **Selected:** amber fill `#F4A124` + halo ring

**Lasso tool** (default active): freehand draw to select a region. The lasso is a dashed amber path while drawing; on release, all documents inside are added to the selection.

**Click:** toggles individual document selection. Shift+click adds without deselecting others.

**Hover tooltip** (card style, anchored near cursor): document title, page count, argument count, top 3 extracted terms. Disappears on mouse-out.

### Filter Rail Content (Corpus)

- **Selection:** count badge + "Clear" / "All" buttons
- **Projection:** UMAP / PCA toggle (swaps pre-computed coordinates)
- **Size nodes by:** Argument count (default) / Uniform / Page count
- **Search:** fuzzy search by document title — highlights matching doc, centres viewport

### Floating Toolbar (inside canvas)

`Lasso | | Zoom+ | Zoom- | | Fit | Reset`

Positioned centre-top of the canvas. Pan mode available by holding Space.

### Node collision

`forceCollide` with padding proportional to node radius prevents dots from stacking. No edge routing needed in this view.

---

## 7. Graph View

Shows the knowledge graph extracted from the selected documents.

### Canvas

D3 force simulation (Barnes-Hut / `forceManyBody`). Nodes: Arguments (rounded square), Entities (circle), Concepts (diamond). See Section 2 for colors.

**Forces:**
- `forceManyBody` (repulsion) — Barnes-Hut approximation for performance
- `forceLink` (edge attraction) — strength proportional to confidence
- `forceCollide` — prevents node overlap (no edge routing needed at this scale)
- `forceCenter` — anchors graph centroid to canvas centre

**Node size:** Arguments sized by degree (edge count). Entities and Concepts uniform.

**Dragging:** node drag pauses its simulation forces, lets the user place it, then resumes. Position is sticky — node stays where dropped until "Reheat" is pressed.

**Clicking a node:** selects it (amber halo ring), opens the floating detail card bottom-right. The `"Open Detail →"` CTA appears in the top bar.

**Edge labels:** shown on hover — `RELATION_TYPE · confidence`. CONTRADICTS and INHIBITS edges are dashed.

**Confidence slider:** hides edges below threshold and dims nodes that become isolated as a result.

### Filter Rail Content (Graph)

- **Node types:** checkboxes for Argument / Entity / Concept with counts
- **Confidence:** range slider, affects edges + node opacity
- **Relations:** toggle groups (Positive / Negative / Causal / Structural) with colour swatches
- **Layout:** Force-directed / Freeze toggle; "Reheat simulation" button
- **Search:** fuzzy search by node name — highlights match, centres viewport

### Floating Detail Card (bottom-right)

Appears on node click. White card with blue border glow, dismissable with ×.

Contents:
- Node type + confidence badge
- Source document + page reference
- 2–3 most significant outgoing relations (type, confidence, truncated predicate text)
- `"Open Detail →"` button (navigates to Detail view)

---

## 8. Detail View

Opened by clicking a node in Graph view and choosing "Open Detail →".

Shows the full context of one Argument across the entire corpus (not just the selected 12 documents).

### Layout

**Top — Corpus reach mini-map** (~180px tall):  
The full UMAP scatter (all 200 docs, small grey dots). The focal document is highlighted with an amber ring. Coloured lines radiate from it to every document that contains an argument with a semantic relation to the focal argument. Line color follows the edge semantic groups (teal/pink/yellow). Line width encodes confidence. Interactive: hover a highlighted dot to see the document title tooltip.

**Bottom — Scrollable relation list:**  
Each row is a `card-mid`:
- Relation type badge (coloured)
- Confidence score
- Source document title + page reference
- Full predicate text of the connected argument

Filterable by relation group via the filter rail.

### Filter Rail Content (Detail)

- **Focus:** node type + id of the current argument (read-only)
- **Scope:** Selection (12 docs) / Full corpus toggle — affects the mini-map and list
- **Relation filter:** toggle relation groups to show/hide from list and mini-map

---

## 9. Implementation Separation of Concerns

| Layer | Responsibility |
|---|---|
| `DataService` | All data fetching; swappable mock → Neo4j → REST |
| `store/` (Zustand) | Global state: selection, filters, active view |
| `components/Shell` | Top bar, tab strip, CTA, status bar, slide animation |
| `components/FilterRail` | Icon rail + expandable sections (content injected per view) |
| `views/CorpusView` | D3 scatter plot, lasso tool, zoom/pan, tooltip |
| `views/GraphView` | D3 force simulation, node/edge rendering, drag, floating detail card |
| `views/DetailView` | Mini-map (reuses corpus scatter logic), relation list |
| `components/Card` | Shared card CSS (white + mid variants, border glow) |
| `components/FloatingCard` | Positioned floating overlay (used for detail card + tooltips) |

---

## 10. Open Questions / Prerequisites

1. **Document-Argument link:** `Argument` nodes need a `source_document_id` property (or a `Document` node + `HAS_ARGUMENT` rel) before the graph-from-selection flow works. Must be resolved in the extraction pipeline.
2. **Embedding source:** Document 2D coordinates (UMAP + PCA) are stored in a vector store (Weaviate or similar — TBD). The `DataService` mock will provide them as static fixtures.
3. **Topic clustering (future):** Corpus view currently uses a single color for all unselected docs. A future pass can add k-means cluster labels from the backend to color-code document clusters.
4. **Graph summarisation (future):** At high node counts, summarisation/clustering techniques may be needed. Not in scope for v1.
5. **Mobile:** Tab-based navigation works on mobile. Horizontal slide animation may apply to touch swipe gestures. Filter rail collapses to a bottom sheet on small screens. Out of scope for v1.
