# GraphVisor v2 — Visual Redesign & UX Enhancement Spec
**Date:** 2026-05-28
**Status:** Approved for implementation planning
**Scope:** Full visual pass — chrome, corpus view, graph view, detail view

---

## 1. Color System & Chrome

### Palette (unchanged data encoding)
| Role | Value | Used for |
|---|---|---|
| Navy | `#073b4c` | **Chrome backgrounds**: top bar, FilterRail strip, status bar |
| Gold/Amber | `#F4A124` | **Only accent**: active tab underline, CTA button, selected state, confidence scores |
| Cyan/Light blue | `#74b9d6` | Unselected corpus dots, Concept nodes |
| Red/Pink | `#ef476f` | **Selected** corpus dots, Entity nodes, negative edges |
| Teal | `#06d6a0` | Positive relation edges |
| Mid blue | `#118ab2` | Entity node fill, card border glow |
| Yellow | `#ffd166` | Causal relation edges |

### Top Bar
- Background: `#073b4c` (navy) — was white
- Logo text: white
- Tab text: `rgba(255,255,255,0.6)` inactive, white active
- Active tab indicator: `#F4A124` gold 2px bottom border — was navy
- CTA button: `background: #F4A124`, `color: #073b4c` — was navy/white
- Shadow: `0 1px 0 rgba(0,0,0,0.2)` (dark shadow on dark bar)

### Canvas Backgrounds
- All three view canvases: `#fafbfc` (unchanged — data pops against dark chrome)

### Global Rule
Gold (`#F4A124`) is the only accent colour in the chrome. Navy and white are the two chrome neutrals.

---

## 2. FilterRail Redesign — Labelled Tab Strip

### Structure
- Width: **120px** (was 44px)
- Background: `#073b4c` navy (matches top bar — unified left chrome)
- Each section button: full-width, ~40px tall, shows text label only (no icons)
- Label style: `11px`, `font-weight: 600`, `color: rgba(255,255,255,0.7)` inactive, white active
- Active/open section: gold left border (`3px solid #F4A124`) + slightly lighter navy background (`#0a4d63`)

### Expandable Panel
- Unchanged: 160px wide, white background, slides out to the right of the strip
- Panel header label: matches the section label
- Total left chrome when panel open: 280px (120 + 160)

### Per-View Labels
| View | Sections |
|---|---|
| Corpus | Selection · Projection · Size by |
| Graph | Node Types · Confidence · Relations · Layout |
| Detail | Focus · Filter |

---

## 3. Corpus View

### Dot Colors
- Unselected: `#74b9d6` (cyan/light blue)
- Selected: `#ef476f` (red)
- Lasso path: `#F4A124` amber dashed stroke (unchanged)

### Concentric Rings Background
Same implementation as Graph View: 7 SVG `<circle>` elements inside the zoom `<g>`:
- Radii: 120, 240, 360, 480, 600, 720, 840px (wider spacing than graph to match UMAP spread)
- `stroke: rgba(7,59,76,0.05)`, `fill: none`, `stroke-width: 1`
- Live inside zoom group → pan/zoom with canvas

### Lasso Tool Visibility
- Canvas background cursor: `crosshair` (always, since lasso is the default tool)
- Small `LASSO` chip label in the top-left of the canvas (inside canvas, not toolbar), same style as `.sl` section labels, to communicate the active tool
- Lasso drag path: amber dashed (unchanged)

### Document Titles on Zoom
- When zoom transform scale ≥ 2.0: show a `<text>` SVG element beneath each dot
- Text: document title truncated to 20 characters (`title.slice(0, 20) + (title.length > 20 ? '…' : '')`)
- Style: `font-size: 9px`, `fill: #073b4c`, `opacity: 0.7`, `text-anchor: middle`, `pointer-events: none`
- Fade in/out: controlled by a CSS class toggled on the zoom group; opacity transition 0.2s
- At scale < 2.0: text elements present but `opacity: 0` (no DOM thrash on every zoom tick)

### Dynamic Sizing
- `ResizeObserver` on the canvas container div
- On resize: re-read `svgEl.getBoundingClientRect()`, recompute `xScale`/`yScale` ranges, update all dot positions via D3 selection `.attr('cx')`/`.attr('cy')`
- Simulation does not re-run; positions update from stored `simPositions` ref
- Graph View: same ResizeObserver pattern applied to the SVG; `forceCenter` target updates and simulation gets a brief `alpha(0.1).restart()`

---

## 4. Graph View

### Missing Links Fix
**Root cause**: `simEdges` currently includes edges whose source or target node was filtered out by `nodeTypes`. When D3's `forceLink` tries to resolve these, it fails silently — the edge gets invalid node references.

**Fix**: before building `simEdges`, filter to only edges where both `source` and `target` IDs exist in the `visibleNodes` set:
```typescript
const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
const simEdges = filteredEdges
  .filter(e => {
    const sid = typeof e.source === 'string' ? e.source : e.source.id
    const tid = typeof e.target === 'string' ? e.target : e.target.id
    return visibleNodeIds.has(sid) && visibleNodeIds.has(tid)
  })
  .map(e => ({ ...e }))
```

### Hover Tooltip
- Trigger: `mouseenter` on any node `<g>`
- Element: a `<div>` positioned absolutely over the canvas (React state, not SVG)
- Content: `[TYPE chip] Label — confidence`
- Type chip colours: Argument = `#073b4c`, Entity = `#118ab2`, Concept = `#74b9d6`
- Style: small white card (`card` class), `padding: 6px 10px`, `font-size: 10px`, `pointer-events: none`
- Position: cursor x+12, y+12, clamped 8px from canvas edges
- Dismissal: `mouseleave` on the node group

### Click → Right-Side Panel
- Trigger: click on any node `<g>`
- Panel: 280px wide, full canvas height, white background, `card` border style, slides in from right with `translateX` transition (0.25s ease)
- Canvas SVG narrows by 280px when panel is open (container flex layout)
- Panel content:
  - Header: node type chip + confidence score
  - Full text (scrollable if > 4 lines)
  - Source document + page reference
  - All outgoing non-structural edges listed compactly: `RELATION_TYPE · confidence · → target label`
  - "Open in Detail View →" button (gold, full-width, at bottom)
- Dismissal: `×` button top-right, click on canvas background, or click on a different node (switches to new node)
- This replaces the current `NodeDetailCard` floating overlay

### Animated Edges

#### Arrowhead Markers
- SVG `<defs>` block with one `<marker>` per relation group (teal, red, yellow, navy-faint for structural)
- Marker: small triangle, `refX` and `refY` set to tip of triangle, `markerWidth/Height: 6`
- All semantic edges (non-structural) get `marker-end` pointing to the appropriate coloured marker
- Structural edges: no arrowhead

#### Flowing Dash Animation
- Semantic edges: `stroke-dasharray: "8 4"`, animated `stroke-dashoffset` via CSS keyframe
- Normal edges (positive, causal): dashoffset decrements (flows source → target)
- Negative edges (CONTRADICTS, INHIBITS): dashoffset increments (flows target → source, visual "pushback")
- Animation duration: `1.5s linear infinite`
- Structural edges: no animation, `stroke-dasharray: "3 3"` static faint dash

#### Pulse Animation
- Each non-structural edge gets a `<circle r="3">` child element
- `<animateMotion>`: travels source → target, `dur="3s"`, `repeatCount="indefinite"`, `keyTimes="0;0.4;0.6;1"`, `keySplines` for ease-in/out
- `<animate>` on opacity: `0 → 0.9 → 0.9 → 0` (fade in at start, fade out at end)
- Pulse colour matches edge group colour
- Structural edges: no pulse

### Hover-to-Mute
- Trigger: `mouseenter` on any node `<g>` or edge `<line>`
- On hover:
  1. Compute the hovered element's one-hop neighbourhood (all nodes connected by at least one edge, plus those edges themselves)
  2. All nodes NOT in that set: `.attr('opacity', 0.06)`
  3. All edges NOT in that set: `.attr('opacity', 0.04)`
  4. Hovered element + neighbours stay at full opacity (1.0 for nodes, 0.8 for edges)
- Trigger: `mouseleave` — restore all nodes and edges to their default opacities
- Implementation: pure D3 attribute updates, no simulation interaction
- For edge hover: the neighbourhood is the source node, target node, and all other edges connected to either

---

## 5. Detail View

### Relation List — Compact Table Style

Replace `card-mid` heavy cards with a compact list. Each row is ~52px tall.

#### Layout (per row)
```
┌─────────────────────────────────────────────────────────────────┐
│ [TYPE]  0.87   Doc title · p.14   "Predicate text up to 80ch…" │
└─────────────────────────────────────────────────────────────────┘
```

- **Type badge**: coloured pill (teal/red/yellow), `font-size: 9px`, `font-weight: 700`, `padding: 2px 7px`
- **Confidence**: `font-size: 10px`, `color: #F4A124`, `font-weight: 700`, fixed `width: 32px`
- **Source**: `font-size: 10px`, `color: #073b4c`, `font-weight: 600` for doc title, muted for page ref
- **Predicate**: `font-size: 10px`, `color: #374151`, `line-height: 1.4`, max 80 characters inline with `…`, wraps to second line if needed
- Row separator: `1px solid rgba(7,59,76,0.06)`
- Row hover: `background: #f4f7fa`

#### Sticky Header
Above the list, a sticky header row:
```
RELATION      CONF   SOURCE                PREDICATE
```
- Style: `.sl` class (9px uppercase), `background: #fff`, `border-bottom: 1px solid rgba(7,59,76,0.1)`

#### No expand/collapse
Full predicate always visible (80-char inline). This gives immediate context without interaction.

### Rest of Detail View
- Header section: more top padding (24px), clear `1px` separator before minimap
- Minimap: unchanged
- FilterRail: labelled strip (same as other views)

---

## 6. Implementation Notes

### Files to modify
| File | Change |
|---|---|
| `src/styles/global.css` | Top bar chrome colour vars (or direct values) |
| `src/components/Shell/Shell.module.css` | Top bar background → navy, tab + CTA colours |
| `src/components/FilterRail/FilterRail.tsx` | Remove icon rendering, add text label |
| `src/components/FilterRail/FilterRail.module.css` | Width 44px → 120px, navy bg, gold active state |
| `src/views/CorpusView/useCorpusD3.ts` | Dot colours, rings, titles on zoom, ResizeObserver |
| `src/views/CorpusView/CorpusView.tsx` | Lasso chip, cursor style |
| `src/views/CorpusView/CorpusView.module.css` | Cursor crosshair on canvas |
| `src/views/GraphView/useGraphD3.ts` | Missing links fix, arrowheads, dash animation, pulse, hover-mute, ResizeObserver |
| `src/views/GraphView/GraphView.tsx` | Hover tooltip state, right-side panel state + layout |
| `src/views/GraphView/NodeDetailCard.tsx` | Replace with right-side panel component |
| `src/views/GraphView/GraphView.module.css` | Panel slide-in, canvas flex layout |
| `src/views/DetailView/RelationList.tsx` | Compact row layout |
| `src/views/DetailView/DetailView.module.css` | Header padding, separator |

### New files
| File | Purpose |
|---|---|
| `src/views/GraphView/NodePanel.tsx` | Right-side click panel (replaces NodeDetailCard) |
| `src/views/GraphView/NodePanel.module.css` | Panel slide-in styles |
| `src/views/GraphView/HoverTooltip.tsx` | Hover tooltip div |

---

## 7. Out of Scope (v2)
- Mobile/touch support
- Graph layout algorithms beyond force-directed
- Neo4j live connection
- Lasso tool mode switching (lasso remains the default and only tool)
