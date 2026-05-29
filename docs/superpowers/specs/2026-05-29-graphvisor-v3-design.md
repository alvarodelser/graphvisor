# GraphVisor v3 — Interaction & Readability Spec
**Date:** 2026-05-29
**Status:** Approved for implementation planning
**Scope:** Menu redesign, corpus simplifications, chevron edges, graph popup, detail improvements

---

## 1. Menu System — Slim Accordion Rail (all views)

### Structure
- Width: **52px** (was 120px)
- Background: `#073b4c` navy
- Each section button: full-width, ~40px tall, short label text (abbreviated, e.g. "Select", "Nodes", "Conf", "Filter")
- Expansion: **inline below the clicked button**, pushing lower buttons down — NO side panel
- Only one section open at a time; click same button to close

### Expanded section
- Renders controls directly inside the 52px strip at full width
- Simple controls (radios, checkboxes, slider) fit within 52px with compact styling
- Strip height grows when a section is open; canvas is never blocked by a panel

### Per-view sections
| View | Sections |
|---|---|
| Corpus | Selection (count + Clear/All) · Size by |
| Graph | Node Types · Confidence · Relations · Layout |
| Detail | Filter (positive/negative/causal) |

**Note:** Projection section removed from Corpus — UMAP is fixed as default. Focus section removed from Detail — argument info lives in content header.

### Active state
- Open section button: `background: #0a4d63`, `border-left: 3px solid #F4A124`
- Closed buttons: `color: rgba(255,255,255,0.6)`

### Files
- `src/components/FilterRail/FilterRail.tsx` + `.module.css` — restructure to accordion inline expansion
- `src/views/CorpusView/CorpusView.tsx` — remove Projection section, remove Size by if desired
- `src/views/DetailView/DetailFilterRail.tsx` — remove Focus section

---

## 2. Corpus View Simplifications

### UMAP/PCA toggle removed
- Projection rail section removed entirely from Corpus
- `projection` state remains in store for future use but is not exposed in UI
- All corpus D3 rendering uses `umap_x`/`umap_y` exclusively

### Fit/Reset toolbar removed
- The floating pill with Fit/Reset buttons is deleted from `CorpusView.tsx`
- `zoomToFit` and `resetZoom` functions removed from `useCorpusD3`

### Lasso bug fix
**Root cause:** The D3 zoom behavior and the lasso drag behavior are both bound to the SVG element, causing conflicts — zoom intercepts drag events meant for the lasso.

**Fix:**
1. Add a full-size transparent background `<rect>` inside the zoom group (before dots layer), sized to the canvas: `width: 100%, height: 100%`, `fill: transparent`, `pointer-events: all`
2. Bind zoom to the SVG element (unchanged)
3. Bind lasso `d3.drag` to this background rect only (not the SVG)
4. Dot click events call `event.stopPropagation()` to prevent triggering lasso
5. Background rect dimensions updated in ResizeObserver alongside dot positions

This gives each behavior a distinct DOM target.

### Files
- `src/views/CorpusView/useCorpusD3.ts` — fix lasso binding, remove zoom controls
- `src/views/CorpusView/CorpusView.tsx` — remove toolbar, remove Projection section

---

## 3. Graph View

### 3.1 Chevron Edges

**Outer shape (locked):** Pentagon chevron — flat open back + flat top/bottom edges + two angled sides meeting at tip.
- SVG: `<polyline>` with 5 points: `x0,yTop  x1,yTop  xTip,yMid  x1,yBot  x0,yBot`
- Total height: ~24px (yTop to yBot), tip reach: ~25px forward from x1
- Stroke: `1.5px`, matching relation color, `opacity: 0.7`, `stroke-linejoin: miter`, `stroke-linecap: butt`
- Fill: `rgba(color, 0.06)` very faint

**Inner marching chevrons:**
- Open `❯` `<polyline>` elements: 3 points — `(x, yTop), (x+14, yMid), (x, yBot)`
- `stroke-width: 6`, `stroke-linejoin: miter`, `stroke-linecap: butt`, `opacity: 0.55`
- Spaced 28px apart
- Animation: `translateX(28px)` over `0.8s linear infinite`
- Negative edges (CONTRADICTS, INHIBITS): reversed animation direction
- Clipped to outer shape via `<clipPath>`

**Structural edges:** Same outer chevron shape but **no inner chevrons**. Static, `opacity: 0.4` (up from 0.2).

**Implementation approach:**
- Each edge rendered as a `<g>` group (not `<line>`)
- Group `transform` updated on simulation tick: `translate(sx,sy) rotate(angle)` where angle is atan2(ty-sy, tx-sx)
- Edge rendered in local coordinate space (horizontal, then rotated into position)
- Length computed as Euclidean distance between source and target nodes

### 3.2 Floating Focused Card

Replaces both `HoverTooltip` and `NodePanel`. Single `<div>` anchored top-right inside the canvas.

**Position:** `position: absolute; top: 12px; right: 12px; width: 260px`

**Content:**
- Type chip + confidence
- Full argument text (scrollable, max-height: 120px)
- Source document + page reference
- "Open in Detail →" button (gold, only shown when node is Argument type)

**States:**
- **Hidden:** `opacity: 0; pointer-events: none`
- **Hover (non-sticky):** `opacity: 1; pointer-events: none` — no gold border
- **Sticky (clicked):** `opacity: 1; pointer-events: all` — `border-left: 3px solid #F4A124` + `×` dismiss button visible
- Transition: `opacity 0.15s ease`

**Hover on edge:** Same card, populated with relation type (large coloured badge), confidence, source node label → target node label. Dismisses on `mouseleave`.

**Dismissal:**
- Click `×` button (sticky state only)
- Click canvas background (calls `onCanvasClick`)
- Hover away from node (non-sticky state)

**Files:**
- `src/views/GraphView/NodeFloatingCard.tsx` — new unified component replacing HoverTooltip + NodePanel
- `src/views/GraphView/NodeFloatingCard.module.css`
- `src/views/GraphView/GraphView.tsx` — hover/sticky state management
- `src/views/GraphView/useGraphD3.ts` — edge rendering as `<g>` groups, chevron shapes

### 3.3 Structural Edge Contrast

- Structural edges: `rgba(7,59,76,0.45)` stroke (was 0.2)
- No other color changes

### 3.4 Tab Highlight Logic

**Detail tab indicator:** When `selectedNodeId !== null`, Detail tab shows a small gold dot `●` (8px, `#F4A124`) next to the label instead of being dimmed. Removes when `selectedNodeId` resets to null.

**Reset logic:**
- Navigating to Corpus and clearing all document selections → `clearSelection()` also calls `setSelectedNode(null)` → Detail tab dims
- Navigating to Corpus view without clearing → `selectedNodeId` persists → Detail tab stays indicated
- Clicking a different node in Graph → `selectedNodeId` updates → Detail tab stays indicated with new node

**Shell.tsx change:**
```tsx
// Detail tab: dot indicator when node selected, dimmed when not
{v === 'detail' && selectedNodeId && <span className={styles.dot}>●</span>}
```

---

## 4. Detail View

### 4.1 Relation Table Column Redesign

**New grid:** `90px 36px 1fr 1fr` (4 columns)

| Column | Content |
|---|---|
| Relation | Type badge (coloured pill) |
| Conf | Confidence score (gold) |
| Source | Document title (shortened) + page ref |
| Argument text | `full_predicate` truncated at 60 chars |

Header labels: `RELATION · CONF · SOURCE · ARGUMENT TEXT`

### 4.2 Predicate Clicking — Navigate to Argument Detail

Each relation row is clickable and navigates to the connected argument's detail.

**Data change:** `ArgumentRelation` interface gains `target_argument_id: string`. `detail.json` updated with `target_argument_id` on each relation (pointing to existing argument IDs in `graph.json`).

**Behavior:**
1. Click a row → call `dataService.getArgumentDetail(rel.target_argument_id)`
2. Update `selectedNodeId` in store to `rel.target_argument_id`
3. Push current argument ID to a local navigation stack (breadcrumb)
4. Render breadcrumb at top: `← Smith et al. 2021` (previous argument's source doc, truncated)
5. Clicking breadcrumb navigates back

**Types update:** `ArgumentRelation.target_argument_id: string`

### 4.3 Minimap Cleanup

Visual refinements only (no structural change):
- Focal doc: `r=7`, amber `#F4A124` fill + amber ring `r=11`
- Related docs: `r=4`, mid-blue `#118ab2`
- Unrelated docs: `r=2`, `#d1d5db`
- Lines: relation group colors at `opacity: 0.5`, `stroke-width: max(0.5, confidence * 1.5)`

### 4.4 Layout Header Cleanup

The argument header gets a gold left accent:
```css
.header {
  border-left: 3px solid #F4A124;
  padding-left: 12px;
  /* removes bottom border from v2 */
}
```

---

## 5. Data Changes

### `src/types/index.ts`
```typescript
export interface ArgumentRelation {
  // ... existing fields ...
  target_argument_id: string  // NEW
}
```

### `src/data/mock/detail.json`
Each relation entry gains `"target_argument_id"`. Mapping from existing data:
- CORRELATES_WITH → `"arg_002"`
- CAUSES → `"arg_003"`
- CONTRADICTS → `"arg_005"`
- SUPPORTS (Patel) → `"arg_002"` (nearest match)
- ASSOCIATED_WITH → `"arg_004"`
- REVEALS → `"arg_001"` (self-reference placeholder, disable click)
- INHIBITS → `"arg_003"`
- INCREASES → `"arg_001"` (self-reference placeholder, disable click)

---

## 6. Files to Modify / Create

**Modified:**
- `src/types/index.ts` — add `target_argument_id` to `ArgumentRelation`
- `src/data/mock/detail.json` — add `target_argument_id` to each relation
- `src/components/FilterRail/FilterRail.tsx` + `.module.css` — accordion inline expansion
- `src/components/Shell/Shell.tsx` + `.module.css` — Detail tab dot indicator
- `src/views/CorpusView/useCorpusD3.ts` — lasso fix, remove zoom controls
- `src/views/CorpusView/CorpusView.tsx` — remove toolbar, remove Projection section
- `src/views/GraphView/useGraphD3.ts` — chevron edge rendering as `<g>` groups
- `src/views/GraphView/GraphView.tsx` — floating card state management
- `src/views/GraphView/GraphFilterRail.tsx` — remove unused sections if any
- `src/views/DetailView/RelationList.tsx` — 4-column grid, clickable rows, breadcrumb
- `src/views/DetailView/DetailView.tsx` — breadcrumb navigation stack
- `src/views/DetailView/DetailView.module.css` — header gold accent
- `src/views/DetailView/DetailFilterRail.tsx` — remove Focus section
- `src/views/DetailView/DetailMiniMap.tsx` — minimap visual cleanup

**Created:**
- `src/views/GraphView/NodeFloatingCard.tsx` — unified hover/sticky node+edge card
- `src/views/GraphView/NodeFloatingCard.module.css`

**Deleted:**
- `src/views/GraphView/HoverTooltip.tsx`
- `src/views/GraphView/NodePanel.tsx` + `.module.css`

---

## 7. Out of Scope (v3)
- Concepts-over-time plot (separate spec)
- Neo4j live connection
- Mobile support
