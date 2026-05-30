# Floating Panels Design

**Date:** 2026-05-30
**Status:** Approved
**Scope:** Replace FilterRail in all three views with two draggable floating panels

---

## Goal

Replace the 52px side accordion rail with two floating action buttons (FABs) at the bottom-left of every view. Clicking a FAB opens an independent draggable panel. Both panels can be open simultaneously.

---

## Layout

Two FABs, anchored inside the view's `.canvas` div (which has `position: relative`):

```
position: absolute   (relative to .canvas div)
bottom: 20px, left: 20px   → Filter FAB (⚙)
bottom: 68px, left: 20px   → Legend FAB (◈)
```

Panels use `position: fixed` (relative to viewport) so they stay visible while dragging and are not clipped by the canvas. Initial `{ left, top }` is calculated from the FAB's `getBoundingClientRect()` at open time.

FAB size: 40×40px round button, background `#073b4c`, icon white.
Gold ring (`#F4A124`, 2px) on the FAB when its panel is open.

---

## FloatingPanel Component

**File:** `src/components/FloatingPanel/FloatingPanel.tsx`
**CSS:** `src/components/FloatingPanel/FloatingPanel.module.css`

```tsx
interface Props {
  icon: string
  label: string
  defaultPosition: { x: number; y: number }  // initial panel position (px from bottom-left of canvas)
  open: boolean
  onToggle: () => void
  children: ReactNode
}
```

### FAB button
- 40×40px, `border-radius: 50%`, `background: #073b4c`, `color: #fff`
- `border: 2px solid transparent` normally; `border-color: #F4A124` when open
- `position: absolute` inside `.canvas` div, bottom+left set by parent

### Panel
- Renders only when `open=true`
- Uses `.card` class (existing global shadow + border-radius)
- `position: fixed`, width 220px, initial position near FAB
- **Drag behaviour:** mousedown on `.panel-header` sets `isDragging=true`; mousemove updates `(x, y)` state via delta; mouseup releases. Uses React state for position, no library needed.
- Panel header: label text + close button (×)
- Panel body: scrollable, `max-height: 60vh`
- z-index: 300 (above edges and nodes)

### Drag implementation (no external library)
```tsx
const [pos, setPos] = useState(defaultPosition)
const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null)

onMouseDown (header): dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
onMouseMove (document): if dragging → setPos({ x: px + (mx - dragStart.mx), y: py + (my - dragStart.my) })
onMouseUp (document): dragStart.current = null
```

---

## FilterRail Removal

Delete usage of `<FilterRail>` from:
- `src/views/CorpusView/CorpusView.tsx`
- `src/views/GraphView/GraphView.tsx`
- `src/views/DetailView/DetailView.tsx`

The `FilterRail` component and CSS module are kept (other code may import them) but no longer rendered in views.

Each view's outer `.view` flex container loses the rail — the canvas div takes full width.

---

## Filter Panel Content Per View

All sections are shown expanded (no inner accordion). The panel itself is the show/hide toggle.

### Corpus
```
— Select —
Count badge · Clear button · All button

— Size —
Radio: Args / Even / Pages
```

### Graph
```
— Node types —
☑ Arg  ☑ Ent  ☑ Con  (checkboxes)

— Confidence —
Slider ≥ 0.00

— Relations —
Colour swatches + checkboxes: positive / negative / causal / structural

— Layout —
[Heat]  [Freeze]
```

### Detail
```
— Filter —
Colour swatches + checkboxes: positive / negative / causal
```

Reuse the existing inline JSX from each view's `railSections` array — move it directly into the filter panel's children.

---

## Legend Panel Content Per View

### Corpus
```
Node types
● blue   Unselected document
● red    Selected document

Size key
■ large  High argument / page count
■ small  Low argument / page count
```

### Graph
```
Nodes
■ dark   Argument
● blue   Entity
◆ teal   Concept

Edges
— green   Positive
— red     Negative
— yellow  Causal
— gray    Structural
```

### Detail
```
Relation groups
● green   Positive
● red     Negative
● yellow  Causal
```

---

## State

Each view manages its own open/closed state for both panels locally (no store changes needed):

```tsx
const [filterOpen, setFilterOpen] = useState(false)
const [legendOpen, setLegendOpen] = useState(false)
```

---

## Files

**Created:**
- `src/components/FloatingPanel/FloatingPanel.tsx`
- `src/components/FloatingPanel/FloatingPanel.module.css`

**Modified:**
- `src/views/CorpusView/CorpusView.tsx` — remove FilterRail, add two FloatingPanels
- `src/views/GraphView/GraphView.tsx` — same
- `src/views/DetailView/DetailView.tsx` — same
- `src/views/CorpusView/CorpusView.module.css` — remove left margin / rail width
- `src/views/GraphView/GraphView.module.css` — same
- `src/views/DetailView/DetailView.module.css` — same

**Unchanged:**
- `src/components/FilterRail/` — kept, just not rendered
- Store, DataService, D3 hooks — untouched

---

## What Does NOT Change

- Shell tabs, navigation, selection logic
- D3 hooks (corpus, graph)
- Detail view relation list
- Global CSS, card styles
