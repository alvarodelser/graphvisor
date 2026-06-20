# Graph View — LOD Guardrail & Demand Meter

**Date:** 2026-06-20
**Scope:** `src/views/GraphView/` + `src/graph/`
**Builds on:** `docs/superpowers/specs/2026-06-19-graph-performance-audit.md`

Makes the graph survive large selections gracefully instead of freezing, and stops
Safari's idle CPU burn. Driven by a scoped **entity count** that selects a level-of-detail
(LOD) mode, a hard guardrail at 300 entities with a "render anyway" escape, and a live
**demand meter** in the concept sidebar so the user can see and reduce load by unchecking
arguments.

---

## Goals

1. **Gate the chevron animation** so Safari stops CPU-repainting idle edges (audit Problem A #1).
2. **Don't load the graph until Explore is active**, and keep it warm afterward unless it's heavy.
3. **Degrade fidelity by entity count** (LOD modes) so medium/large graphs stay smooth.
4. **Hard guardrail at 300 entities** — block rendering, surface the concept sidebar + demand
   meter, prompt the user to uncheck arguments; offer a "Render anyway" escape.
5. **Optimize the O(n²)/O(n³) forces** (audit Problem B) so Calm/Lean graphs (and "Render anyway")
   don't stall.

### Non-goals (explicit follow-ups)
- Canvas edge layer / dropping per-edge clip-paths entirely (audit Problem A #2 — bigger rewrite).
- Viewport culling tied to the zoom transform.

---

## Entity count → LOD mode

The driver is **`count` = number of `Entity`-type nodes in `fnodes`** (the actual rendered
node set computed in `GraphView.tsx`). It already recomputes whenever the user checks/unchecks
arguments in the concept sidebar, so the meter and mode update live.

| `count` | Mode | Edges | Chevron animation | Particles | Blobs | Forces |
|---------|------|-------|-------------------|-----------|-------|--------|
| 0–119 | **full** | chevron arrows | animated (non-Safari) | on | full | exact (current) |
| 120–209 | **calm** | chevron arrows | static | off | full | **optimized** |
| 210–299 | **lean** | plain straight lines | n/a | off | hull-only | **optimized** |
| 300+ | **blocked** | not rendered | — | — | — | — |

Boundaries are inclusive-low / exclusive-high (e.g. 120 is Calm, 119 is Full).

`mode` is a pure function of `count`, defined once and unit-tested at the boundaries.

---

## Components & changes

### 1. Animation gate — `global.css`, `useGraphD3.ts`

- In `src/styles/global.css`, make `.chevrons-forward` / `.chevrons-reverse` **static by
  default** (no `animation`). Add a parent gate:
  `.edge-anim .chevrons-forward { animation: march-forward 0.8s linear infinite; }`
  (and the reverse). This is a single toggle — no change to per-edge `edgeStyles.ts` markup
  for the animation itself.
- In `useGraphD3.ts`, set `svg.classed('edge-anim', animateEdges)` where
  `animateEdges = mode === 'full' && !isSafari`.
- Add a small `isSafari()` capability check (WebKit, excluding Chromium). Lives in a util
  (e.g. `src/utils/browser.ts`); evaluated once.

**Result:** Safari never runs the infinite animation → idle CPU flat. Chrome keeps the
marching look only on small (Full) graphs.

### 2. Lazy mount + retention — `GraphView.tsx`, `GraphCanvasView.tsx`

- **First load:** don't call `dataService.getGraph(...)` and don't mount `GraphCanvasView`
  until Explore has been activated at least once. Track `hasActivatedOnce` (set true when
  `isActive` first becomes true; never reset).
- **Render mode** accounts for the escape: `renderMode = (mode === 'blocked' && forceRender) ? 'lean' : mode`.
- **Mount condition for `GraphCanvasView`:**
  ```
  hasActivatedOnce && renderMode !== 'blocked' && (isActive || renderMode !== 'lean')
  ```
  - Full / Calm graphs stay mounted (warm) when navigating to Detail or back to Select/Discover.
  - Lean graphs (and forced 300+ renders) **unmount when you leave Explore** to free CPU; remount on return.
  - Blocked (not forced) never mounts the sim — the banner shows instead.
- `lod` (the `renderMode`) is passed `GraphView → GraphCanvasView → useGraphD3`.

### 3. Guardrail UI — `GraphView.tsx` (+ banner CSS)

- State `forceRender: boolean`. Resets to `false` whenever `count` drops below 300, or when
  `selectedDocumentIds` / `selectedHypothesisIds` change.
- When `isActive && mode === 'blocked' && !forceRender`:
  - Auto-open the concept sidebar (`setPanelOpen(true)`).
  - Render a **banner** over the canvas area (canvas itself blank): *"Large selection — N
    entities. Uncheck arguments in the panel to get under 300."*
  - A **"Render anyway (may lag)"** button sets `forceRender = true` → graph mounts in Lean.

### 4. Demand meter — `ConceptHierarchy.tsx` (+ meter CSS)

- New props: `entityCount: number`, `limit = 300` (passed from `GraphView` — the same `count`).
- A **wifi-style bar meter** in the sidebar header: N discrete bars filling proportionally to
  `entityCount / limit`, colored **green → amber → red** as it approaches the limit, with
  `{entityCount}/{limit}` text. At/over the limit it reads red/"OVER".
- **Per-argument entity counts:** each argument row shows its `blob.entityIds.length` as a hint
  (which arguments to uncheck for the biggest drop). `ConceptHierarchy` builds a
  `Map<argId, entityCount>` from the `blobs` prop it already receives.
- Lives alongside the existing `{tree.length} concepts · {blobs.length} arguments` header line.

### 5. Force optimizations — `forces.ts`, `useGraphD3.ts`

Engaged only at **Calm and above** (`count >= 120`); Full keeps the exact forces (cheap at that
size). Same qualitative layout, lower complexity:

- **`blobRepulsionForce`** (`forces.ts:128`, O(args·members·allNodes)) → **uniform spatial grid**:
  bucket nodes by cell, test only neighbors in adjacent cells. ~O(n).
- **`argSeparation`** (`useGraphD3.ts` ~442, all-pairs O(args²)) → **spatial grid** over argument
  centroids.
- **`argLayoutForce`** (`forces.ts:48`, O(args²)) → **linearized**: compute each chain's centroid
  once per tick; each argument steers away from the chain centroid instead of scanning all siblings.

`useGraphD3` selects the exact vs optimized force implementation based on `mode`.

### 6. Edge rendering for Lean — `edgeStyles.ts`, `useGraphD3.ts`

Add a **plain-line edge variant**: a straight `<line>`/path from source to target, no pentagon
body, no chevron track, no per-edge clip-path. `useGraphD3` chooses the builder by `mode`
(`lean` → plain line; `full`/`calm` → existing chevron arrow). Dropping the clip-path in Lean
also sheds the per-tick clip mutation cost.

---

## Data flow

```
selectedDocumentIds ──► getGraph (gated on hasActivatedOnce)
selectedHypothesisIds ─► hypothesis/concept scope ─► fnodes/fedges/fblobs
scope (concept sidebar checkboxes) ─┘
        │
        ▼
count = fnodes Entity length ──► mode(count) ──► renderMode (+forceRender)
        │                                  │
        ├──► ConceptHierarchy demand meter │
        └──► GraphCanvasView mount gate ───┴──► useGraphD3 (lod): animation,
                                                  particles, blobs, edge builder, forces
```

---

## Testing

**Unit**
- `mode(count)` at boundaries: 0, 119, 120, 209, 210, 299, 300.
- `forceRender` reset logic (drops below 300; doc/hypothesis change).
- Mount-condition truth table (full/calm/lean/blocked × active/inactive × forceRender).
- Demand-meter bar fill + color band given `entityCount / limit`.
- Optimized forces: parity-ish vs naive on a small fixture (no NaN, comparable displacement
  direction); grid bucketing correctness.

**Existing suites**
- `src/graph/*.test.ts`, `src/views/GraphView/*.test.ts` stay green.

**Manual / browser**
- Safari: ~20-edge graph, confirm idle CPU drops to flat after the animation gate.
- Freeze: select many docs/hypotheses; confirm no main-thread stall — blocked at 300 with
  banner + meter; "Render anyway" mounts Lean without freezing (optimized forces).
- Retention: Calm graph stays warm across Detail/Select/Discover; Lean graph unmounts when
  leaving Explore and remounts on return.
- Meter: unchecking high-count arguments visibly drops the bars and the number.

---

## Sequencing

1. Animation gate + `isSafari` util (smallest, verify in Safari first).
2. `mode(count)` + lazy-mount/retention + `lod` plumbing through to `useGraphD3`.
3. LOD toggles in `useGraphD3` (animation/particles/blobs) + Lean plain-line edges.
4. Force optimizations (grid + linearized) gated at Calm+.
5. Guardrail banner + `forceRender` escape.
6. Demand meter + per-argument counts in `ConceptHierarchy`.

Each step is independently verifiable.
