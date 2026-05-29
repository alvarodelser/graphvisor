# Graph Edge Refinements Design

**Date:** 2026-05-29  
**Status:** Approved  
**Scope:** `src/views/GraphView/useGraphD3.ts`, `src/styles/global.css`

---

## Goal

Refine graph view edges and force simulation:

1. **Slim chevrons** — reduce visual weight of all semantic edges
2. **Structural edges** — replace chevron shape with a plain solid line
3. **Converging edges** — CONTRADICTS and INHIBITS get two opposing half-chevrons with inner animation flowing toward the midpoint
4. **Force simulation** — increase node repulsion so nodes spread out further

---

## Geometry Constants

Replace the current constants with:

```typescript
const CHEV_HALF_H     = 6    // half-height: total 12 px (was 12)
const CHEV_TIP_OFFSET = 8    // tip projection beyond body end (was 25)
const CHEV_SPACING    = 20   // px between inner chevron backs (was 28)
const CHEV_TIP_REACH  = 8    // how far inner chevron tip projects (was 14)
const CHEV_COUNT      = 28   // pre-created chevrons per direction (was 16)
const CHEV_START      = -28  // start well before x=0 for seamless entry
```

The marching animation range must match `CHEV_SPACING`:

```css
@keyframes march-forward { from { transform: translateX(0); } to { transform: translateX(20px); } }
@keyframes march-reverse { from { transform: translateX(0); } to { transform: translateX(-20px); } }
```

---

## Edge Types

### Standard semantic edges (positive, causal)

- Outer shape: single pentagon `0,−h  (len−tip),−h  len,0  (len−tip),h  0,h`
- Inner animation: single group with `chevrons-forward`
- Clip path: same polygon as outer shape

Relations: SUPPORTS, CORRELATES_WITH, REVEALS, INCREASES, ASSOCIATED_WITH, CAUSES

### Converging edges (negative: CONTRADICTS, INHIBITS)

Replace single pentagon + reverse flow with **two opposing half-chevrons**:

**Left half** (source → midpoint, points right →):
```
0,−h  (mid−tip),−h  mid,0  (mid−tip),h  0,h
```
where `mid = len / 2`

**Right half** (target → midpoint, points left ←):
```
len,−h  (mid+tip),−h  mid,0  (mid+tip),h  len,h
```

Two clip paths — one per half — each matching its outer polygon exactly.

**Left inner group**: right-pointing chevrons `bx,−h  bx+reach,0  bx,h`, class `chevrons-forward` (marches →)  
**Right inner group**: left-pointing chevrons `bx+reach,−h  bx,0  bx+reach,h`, class `chevrons-reverse` (marches ←)

clipPath IDs: `edgeclip-L-${d.id}` and `edgeclip-R-${d.id}`

The clip path is a polygon, not a rectangle. This guarantees inner chevrons are always contained within the outer shape, including the tapered tip zone.

### Structural edges

Replace `<polyline chevron-outer>` with a `<line>`:

```typescript
g.append('line')
  .attr('class', 'struct-line')
  .attr('x1', 0).attr('y1', 0)
  .attr('x2', 0).attr('y2', 0)   // updated on tick
  .attr('stroke', '#64748b')
  .attr('stroke-width', 2)
  .attr('opacity', 0.75)
```

On tick: `sel.select('.struct-line').attr('x2', len)` (no rotation needed — the `<g>` is already rotated).

No clip path, no inner chevrons.

---

## Tick Function Changes

For standard edges: same as before — update `.chevron-outer` points + clip polygon.

For converging edges: update two outer polygons + two clip polygons:
```typescript
const pts_L = halfChevronLeftPoints(len)
const pts_R = halfChevronRightPoints(len)
sel.select('.chevron-L').attr('points', pts_L)
sel.select('.chevron-R').attr('points', pts_R)
d3.select(`#edgeclip-L-${d.id} polygon`).attr('points', pts_L)
d3.select(`#edgeclip-R-${d.id} polygon`).attr('points', pts_R)
```

For structural edges: `sel.select('.struct-line').attr('x2', len)`

---

## Force Simulation

Increase charge to spread nodes further:

```typescript
.force('charge', d3.forceManyBody<GraphNode>().strength(-320).theta(0.9))
```

(was `-180`)

---

## Helper Functions

```typescript
function chevronOuterPoints(len: number): string {
  const bodyEnd = Math.max(0, len - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${len},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}

function halfChevronLeftPoints(len: number): string {
  const mid = len / 2
  const bodyEnd = Math.max(0, mid - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${mid},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}

function halfChevronRightPoints(len: number): string {
  const mid = len / 2
  const bodyStart = Math.min(len, mid + CHEV_TIP_OFFSET)
  return `${len},${-CHEV_HALF_H} ${bodyStart},${-CHEV_HALF_H} ${mid},0 ${bodyStart},${CHEV_HALF_H} ${len},${CHEV_HALF_H}`
}
```

---

## Files Changed

- `src/views/GraphView/useGraphD3.ts` — geometry constants, helper functions, edge rendering, tick, force strength
- `src/styles/global.css` — update animation translateX from 28px → 20px

---

## What Does NOT Change

- Node rendering (rect/circle/diamond)
- Hover/mute behaviour
- Selection halo
- FilterRail, NodeFloatingCard, GraphView.tsx
- All other views
