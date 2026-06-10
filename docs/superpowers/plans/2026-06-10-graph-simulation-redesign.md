# Graph Simulation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the GraphVisor graph view from the ground up so entities lay out as a conventional force-directed graph, chains are placed by size, arguments render as clean rounded convex cells that collapse to fixed-size nodes on zoom-out, and concepts orbit the graph on a single ring with spiral links.

**Architecture:** Extract a new `src/graph/` module group of small pure functions (model derivation, blob geometry, soft bodies, collapse resolution, concept orbit, simulation forces), each unit-tested in isolation. The D3/DOM hook `useGraphD3.ts` becomes a thin orchestrator that wires these together and renders SVG layers. The hook's public contract (`useGraphD3(svgRef, nodes, edges, opts) → { reheat }` plus the `HoverItem` export) is unchanged, so `GraphView.tsx` and `NodeFloatingCard.tsx` need no edits.

**Tech Stack:** React 18, D3 7 (force simulation, zoom, drag, d3-polygon), TypeScript, Vitest (jsdom, explicit `import` from `vitest`).

**Reference spec:** `docs/superpowers/specs/2026-06-10-graph-simulation-redesign-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/graph/graphModel.ts` (create) | Derive the `GraphModel`: entity adjacency/degree, chains (components) + sizes, argument↔entity maps, solo/bridge classification, concept↔argument maps. |
| `src/graph/blobGeometry.ts` (create; supersedes `src/utils/blobGeometry.ts`) | Rounded convex-hull / capsule / circle path generation. Pure geometry. |
| `src/graph/softBodies.ts` (create) | Generic 2D soft-body integrator (spring-to-target + mutual repulsion + damping + pin override) for collapsed argument nodes. |
| `src/graph/collapse.ts` (create) | Per-argument collapse detection by on-screen size; hidden-entity set; `resolveEndpoint` re-pointing; resolved visible edge list. |
| `src/graph/conceptOrbit.ts` (create) | Global ring radius, per-concept target angle, ring-constrained angular soft bodies, spiral link path. |
| `src/graph/forces.ts` (create) | D3 custom force factories: chain centers + chain-home, argument layout (cohesion + fan + orientation), bridge pull, blob repulsion. |
| `src/views/GraphView/useGraphD3.ts` (rewrite) | Orchestrator: build model, configure simulation, render SVG layers, handle zoom/LOD/tick/drag/hover/selection. |
| `src/utils/blobGeometry.ts` (delete at the end) | Removed once the hook imports from `src/graph/blobGeometry.ts`. |

Test files live beside their modules: `src/graph/<name>.test.ts`.

---

## Conventions for every task

- Tests import explicitly: `import { describe, it, expect } from 'vitest'` (vitest globals types are not configured).
- Run a single test file with: `npx vitest run src/graph/<name>.test.ts`
- Run the whole suite with: `npm run test:run`
- Type-check with: `npx tsc --noEmit`
- Commit after each green task. Branch is already `redesign/graph-simulation`.

---

## Task 1: Graph model derivation

**Files:**
- Create: `src/graph/graphModel.ts`
- Test: `src/graph/graphModel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/graph/graphModel.test.ts
import { describe, it, expect } from 'vitest'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

function entity(id: string): GraphNode {
  return { id, type: 'Entity', label: id, confidence: 1 }
}
function edge(id: string, s: string, t: string): GraphEdge {
  return { id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causal' }
}
function blob(id: string, entityIds: string[], concept = 'C1'): ArgumentBlob {
  return {
    id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
    source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: [concept],
  }
}

describe('buildGraphModel', () => {
  // Two separate chains: (a-b-c) and (d-e)
  const nodes = [entity('a'), entity('b'), entity('c'), entity('d'), entity('e')]
  const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'd', 'e')]
  const blobs = [blob('arg0', ['a', 'b']), blob('arg1', ['b', 'c']), blob('arg2', ['d', 'e'], 'C2')]
  const m = buildGraphModel(nodes, edges, blobs)

  it('keeps only entity nodes and entity-entity edges', () => {
    expect(m.entities.map(n => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(m.edges.map(e => e.id).sort()).toEqual(['e1', 'e2', 'e3'])
  })

  it('computes degree', () => {
    expect(m.degree.get('b')).toBe(2)
    expect(m.degree.get('a')).toBe(1)
  })

  it('detects two chains with correct sizes', () => {
    const chainA = m.chainOf.get('a')!
    const chainD = m.chainOf.get('d')!
    expect(chainA).not.toBe(chainD)
    expect(m.chainSizes.get(chainA)).toBe(3)
    expect(m.chainSizes.get(chainD)).toBe(2)
    expect(m.chainsBySize[0]).toBe(chainA) // largest first
  })

  it('classifies solo vs bridge entities', () => {
    // b is in arg0 and arg1 -> bridge; a, c, d, e -> solo
    expect(m.bridgeEntities.has('b')).toBe(true)
    expect(m.soloEntities.has('a')).toBe(true)
    expect(m.soloEntities.has('b')).toBe(false)
    expect(m.entityArgs.get('b')!.sort()).toEqual(['arg0', 'arg1'])
  })

  it('groups concepts by label and maps to arguments', () => {
    const c1 = m.argConcept.get('arg0')!
    expect(m.argConcept.get('arg1')).toBe(c1)        // same label C1 -> merged
    expect(m.argConcept.get('arg2')).not.toBe(c1)    // C2 distinct
    expect(m.conceptArgs.get(c1)!.sort()).toEqual(['arg0', 'arg1'])
    expect(m.conceptLabels.get(c1)).toBe('C1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/graphModel.test.ts`
Expected: FAIL — `buildGraphModel` not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/graph/graphModel.ts
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

export interface GraphModel {
  entities: GraphNode[]
  entityIds: Set<string>
  edges: GraphEdge[]                          // entity-entity edges only
  adjacency: Map<string, Set<string>>        // entity id -> neighbour entity ids
  adjacentEdges: Map<string, Set<string>>    // entity id -> incident edge ids
  degree: Map<string, number>
  chainOf: Map<string, string>               // entity id -> chain (component) id
  chainSizes: Map<string, number>            // chain id -> entity count
  chainsBySize: string[]                     // chain ids, descending size
  arguments: ArgumentBlob[]
  argMembers: Map<string, string[]>          // arg id -> member entity ids
  entityArgs: Map<string, string[]>          // entity id -> arg ids
  soloEntities: Set<string>
  bridgeEntities: Set<string>
  conceptArgs: Map<string, string[]>         // concept id -> arg ids
  argConcept: Map<string, string>            // arg id -> concept id
  conceptLabels: Map<string, string>         // concept id -> label
}

const edgeEnd = (e: GraphEdge, which: 'source' | 'target'): string => {
  const v = e[which]
  return typeof v === 'string' ? v : (v as GraphNode).id
}

export function buildGraphModel(
  nodes: GraphNode[],
  edges: GraphEdge[],
  blobs: ArgumentBlob[],
): GraphModel {
  const entities = nodes.filter(n => n.type === 'Entity')
  const entityIds = new Set(entities.map(n => n.id))

  const entEdges = edges.filter(
    e => entityIds.has(edgeEnd(e, 'source')) && entityIds.has(edgeEnd(e, 'target')),
  )

  const adjacency = new Map<string, Set<string>>()
  const adjacentEdges = new Map<string, Set<string>>()
  const degree = new Map<string, number>()
  entities.forEach(n => {
    adjacency.set(n.id, new Set())
    adjacentEdges.set(n.id, new Set())
    degree.set(n.id, 0)
  })
  entEdges.forEach(e => {
    const s = edgeEnd(e, 'source'), t = edgeEnd(e, 'target')
    adjacency.get(s)!.add(t)
    adjacency.get(t)!.add(s)
    adjacentEdges.get(s)!.add(e.id)
    adjacentEdges.get(t)!.add(e.id)
    degree.set(s, degree.get(s)! + 1)
    degree.set(t, degree.get(t)! + 1)
  })

  // Connected components via union-find
  const parent = new Map<string, string>()
  entities.forEach(n => parent.set(n.id, n.id))
  const find = (id: string): string => {
    let p = parent.get(id)!
    while (p !== parent.get(p)!) { parent.set(p, parent.get(parent.get(p)!)!); p = parent.get(p)! }
    return p
  }
  entEdges.forEach(e => {
    const rs = find(edgeEnd(e, 'source')), rt = find(edgeEnd(e, 'target'))
    if (rs !== rt) parent.set(rs, rt)
  })
  const chainOf = new Map<string, string>()
  entities.forEach(n => chainOf.set(n.id, find(n.id)))
  const chainSizes = new Map<string, number>()
  entities.forEach(n => {
    const c = chainOf.get(n.id)!
    chainSizes.set(c, (chainSizes.get(c) ?? 0) + 1)
  })
  const chainsBySize = [...chainSizes.keys()].sort(
    (a, b) => (chainSizes.get(b)! - chainSizes.get(a)!) || (a < b ? -1 : 1),
  )

  // Arguments: keep only those whose members are all present entities
  const args = blobs.filter(b => b.entityIds.every(id => entityIds.has(id)))
  const argMembers = new Map<string, string[]>()
  const entityArgs = new Map<string, string[]>()
  args.forEach(a => {
    argMembers.set(a.id, a.entityIds)
    a.entityIds.forEach(eid => {
      if (!entityArgs.has(eid)) entityArgs.set(eid, [])
      entityArgs.get(eid)!.push(a.id)
    })
  })
  const soloEntities = new Set<string>()
  const bridgeEntities = new Set<string>()
  for (const [eid, ids] of entityArgs) {
    if (ids.length > 1) bridgeEntities.add(eid)
    else soloEntities.add(eid)
  }

  // Concepts: merge arguments by first parent-concept label
  const conceptArgs = new Map<string, string[]>()
  const argConcept = new Map<string, string>()
  const conceptLabels = new Map<string, string>()
  args.forEach(a => {
    const label = a.parent_concepts[0] ?? `concept-${a.concept_id}`
    const cid = `concept-${label}`
    argConcept.set(a.id, cid)
    conceptLabels.set(cid, label)
    if (!conceptArgs.has(cid)) conceptArgs.set(cid, [])
    conceptArgs.get(cid)!.push(a.id)
  })

  return {
    entities, entityIds, edges: entEdges, adjacency, adjacentEdges, degree,
    chainOf, chainSizes, chainsBySize, arguments: args, argMembers, entityArgs,
    soloEntities, bridgeEntities, conceptArgs, argConcept, conceptLabels,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/graphModel.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/graph/graphModel.ts src/graph/graphModel.test.ts
git commit -m "feat(graph): add graph model derivation with chains and solo/bridge classification"
```

---

## Task 2: Blob geometry (rounded convex hull)

**Files:**
- Create: `src/graph/blobGeometry.ts`
- Test: `src/graph/blobGeometry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/graph/blobGeometry.test.ts
import { describe, it, expect } from 'vitest'
import { computeBlobPath, roundedHullPath, BLOB_PAD, BLOB_CORNER } from './blobGeometry'

describe('computeBlobPath', () => {
  it('returns null for empty input', () => {
    expect(computeBlobPath([])).toBeNull()
  })

  it('renders a circle for a single point', () => {
    const d = computeBlobPath([[0, 0]])!
    expect(d).toMatch(/^M/)
    expect(d).toContain('A')        // arc commands for the circle
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('renders a capsule for two points', () => {
    const d = computeBlobPath([[0, 0], [100, 0]])!
    expect(d).toMatch(/^M/)
    expect(d).toContain('A')        // two end caps
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('renders a closed rounded hull for three or more points', () => {
    const d = computeBlobPath([[0, 0], [100, 0], [50, 100]])!
    expect(d).toMatch(/^M/)
    expect(d).toContain('Q')        // rounded corners use quadratic curves
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('exposes constants', () => {
    expect(BLOB_PAD).toBeGreaterThan(0)
    expect(BLOB_CORNER).toBeGreaterThan(0)
  })
})

describe('roundedHullPath', () => {
  it('keeps every output coordinate finite', () => {
    const d = roundedHullPath([[0, 0], [100, 0], [100, 100], [0, 100]], 10)
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    expect(nums.every(Number.isFinite)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/blobGeometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/graph/blobGeometry.ts
import { polygonHull } from 'd3-polygon'

export const BLOB_PAD = 24       // outward padding from member points, graph units
export const BLOB_CORNER = 14    // corner rounding radius, graph units

type Pt = [number, number]

function circlePath(cx: number, cy: number, r: number): string {
  return [
    `M ${cx - r},${cy}`,
    `A ${r},${r} 0 1 1 ${cx + r},${cy}`,
    `A ${r},${r} 0 1 1 ${cx - r},${cy}`,
    'Z',
  ].join(' ')
}

function capsulePath(ax: number, ay: number, bx: number, by: number, pad: number): string {
  const dx = bx - ax, dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * pad, ny = (dx / len) * pad
  return [
    `M ${ax + nx},${ay + ny}`,
    `L ${bx + nx},${by + ny}`,
    `A ${pad},${pad} 0 0 1 ${bx - nx},${by - ny}`,
    `L ${ax - nx},${ay - ny}`,
    `A ${pad},${pad} 0 0 1 ${ax + nx},${ay + ny}`,
    'Z',
  ].join(' ')
}

function expand(hull: Pt[], pad: number): Pt[] {
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return hull.map(([x, y]) => {
    const dx = x - cx, dy = y - cy
    const len = Math.hypot(dx, dy) || 1
    return [x + (dx / len) * pad, y + (dy / len) * pad] as Pt
  })
}

// Rounded polygon: each vertex replaced by a quadratic-curve corner of radius r
// (clamped to half the shorter adjacent edge so corners never overshoot).
export function roundedHullPath(poly: Pt[], r: number): string {
  const n = poly.length
  if (n < 3) return ''
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n], cur = poly[i], next = poly[(i + 1) % n]
    const v1x = prev[0] - cur[0], v1y = prev[1] - cur[1]
    const v2x = next[0] - cur[0], v2y = next[1] - cur[1]
    const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const p1x = cur[0] + (v1x / l1) * rr, p1y = cur[1] + (v1y / l1) * rr
    const p2x = cur[0] + (v2x / l2) * rr, p2y = cur[1] + (v2y / l2) * rr
    d += i === 0 ? `M ${p1x},${p1y}` : ` L ${p1x},${p1y}`
    d += ` Q ${cur[0]},${cur[1]} ${p2x},${p2y}`
  }
  return d + ' Z'
}

export function computeBlobPath(
  points: Pt[],
  pad: number = BLOB_PAD,
  corner: number = BLOB_CORNER,
): string | null {
  if (points.length === 0) return null
  if (points.length === 1) return circlePath(points[0][0], points[0][1], pad)
  if (points.length === 2) {
    return capsulePath(points[0][0], points[0][1], points[1][0], points[1][1], pad)
  }
  const hull = polygonHull(points)
  if (!hull) {
    // Collinear 3+ points: treat as a capsule between the extremes
    let a = points[0], b = points[0], best = -1
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        const dd = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1])
        if (dd > best) { best = dd; a = points[i]; b = points[j] }
      }
    return capsulePath(a[0], a[1], b[0], b[1], pad)
  }
  return roundedHullPath(expand(hull as Pt[], pad), corner)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/blobGeometry.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/graph/blobGeometry.ts src/graph/blobGeometry.test.ts
git commit -m "feat(graph): add rounded convex-hull blob geometry"
```

---

## Task 3: Soft bodies (argument-node integrator)

**Files:**
- Create: `src/graph/softBodies.ts`
- Test: `src/graph/softBodies.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/graph/softBodies.test.ts
import { describe, it, expect } from 'vitest'
import { stepSoftBodies, type SoftBody } from './softBodies'

function body(id: string, x: number, y: number): SoftBody {
  return { id, x, y, vx: 0, vy: 0 }
}

describe('stepSoftBodies', () => {
  it('springs a body toward its target', () => {
    const bodies = new Map([['a', body('a', 0, 0)]])
    const targets = new Map([['a', { x: 100, y: 0 }]])
    for (let i = 0; i < 200; i++) stepSoftBodies(bodies, { targets, pinned: new Map() })
    expect(bodies.get('a')!.x).toBeGreaterThan(90)
    expect(Math.abs(bodies.get('a')!.y)).toBeLessThan(1)
  })

  it('pins a body exactly at its pinned position and zeroes velocity', () => {
    const bodies = new Map([['a', body('a', 0, 0)]])
    const targets = new Map([['a', { x: 100, y: 0 }]])
    const pinned = new Map([['a', { x: 5, y: 7 }]])
    stepSoftBodies(bodies, { targets, pinned })
    const b = bodies.get('a')!
    expect(b.x).toBe(5)
    expect(b.y).toBe(7)
    expect(b.vx).toBe(0)
    expect(b.vy).toBe(0)
  })

  it('separates two bodies sharing one target by at least repelDist', () => {
    const bodies = new Map([['a', body('a', 0, 0)], ['b', body('b', 1, 0)]])
    const targets = new Map([['a', { x: 0, y: 0 }], ['b', { x: 0, y: 0 }]])
    for (let i = 0; i < 400; i++)
      stepSoftBodies(bodies, { targets, pinned: new Map(), repelDist: 40, repelStrength: 0.5 })
    const a = bodies.get('a')!, b = bodies.get('b')!
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(30)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/softBodies.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/graph/softBodies.ts
export interface SoftBody { id: string; x: number; y: number; vx: number; vy: number }

export interface StepOptions {
  targets: Map<string, { x: number; y: number }>   // spring target per body
  pinned: Map<string, { x: number; y: number }>    // hard override (drag / anchor)
  spring?: number       // pull toward target
  repelDist?: number    // min separation distance
  repelStrength?: number
  damping?: number
}

export function stepSoftBodies(bodies: Map<string, SoftBody>, opts: StepOptions): void {
  const spring = opts.spring ?? 0.15
  const repelDist = opts.repelDist ?? 0
  const repelStrength = opts.repelStrength ?? 0.5
  const damping = opts.damping ?? 0.72

  // Pinned bodies snap and stop
  for (const [id, p] of opts.pinned) {
    const b = bodies.get(id)
    if (b) { b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0 }
  }

  // Spring toward target (skip pinned)
  for (const b of bodies.values()) {
    if (opts.pinned.has(b.id)) continue
    const t = opts.targets.get(b.id)
    if (!t) continue
    b.vx += (t.x - b.x) * spring
    b.vy += (t.y - b.y) * spring
  }

  // Mutual repulsion
  if (repelDist > 0) {
    const arr = [...bodies.values()]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], c = arr[j]
        const dx = c.x - a.x, dy = c.y - a.y
        const dist = Math.hypot(dx, dy) || 0.01
        if (dist < repelDist) {
          const f = (repelStrength * (repelDist - dist)) / dist
          if (!opts.pinned.has(a.id)) { a.vx -= dx * f; a.vy -= dy * f }
          if (!opts.pinned.has(c.id)) { c.vx += dx * f; c.vy += dy * f }
        }
      }
    }
  }

  // Integrate + damp (skip pinned)
  for (const b of bodies.values()) {
    if (opts.pinned.has(b.id)) continue
    b.vx *= damping; b.vy *= damping
    b.x += b.vx; b.y += b.vy
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/softBodies.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/graph/softBodies.ts src/graph/softBodies.test.ts
git commit -m "feat(graph): add generic soft-body integrator for argument nodes"
```

---

## Task 4: Collapse resolution

**Files:**
- Create: `src/graph/collapse.ts`
- Test: `src/graph/collapse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/graph/collapse.test.ts
import { describe, it, expect } from 'vitest'
import { computeCollapse } from './collapse'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

const entity = (id: string): GraphNode => ({ id, type: 'Entity', label: id, confidence: 1 })
const edge = (id: string, s: string, t: string): GraphEdge =>
  ({ id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causal' })
const blob = (id: string, entityIds: string[]): ArgumentBlob => ({
  id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: ['C1'],
})

describe('computeCollapse', () => {
  // arg0 = {a,b} tight (collapses), arg1 = {c,d} far apart (stays expanded)
  const nodes = [entity('a'), entity('b'), entity('c'), entity('d')]
  const edges = [edge('e1', 'b', 'c')] // bridge edge between the two arguments
  const blobs = [blob('arg0', ['a', 'b']), blob('arg1', ['c', 'd'])]
  const model = buildGraphModel(nodes, edges, blobs)
  const positions = new Map([
    ['a', { x: 0, y: 0 }], ['b', { x: 5, y: 0 }],          // 5px apart
    ['c', { x: 500, y: 0 }], ['d', { x: 900, y: 0 }],      // 400px apart
  ])
  const r = computeCollapse(model, positions, 1, 70)

  it('collapses only the small argument', () => {
    expect(r.collapsedArgIds.has('arg0')).toBe(true)
    expect(r.collapsedArgIds.has('arg1')).toBe(false)
  })

  it('hides members of collapsed arguments', () => {
    expect(r.hiddenEntityIds.has('a')).toBe(true)
    expect(r.hiddenEntityIds.has('b')).toBe(true)
    expect(r.hiddenEntityIds.has('c')).toBe(false)
  })

  it('resolves a hidden entity to its collapsed argument node', () => {
    expect(r.resolveEndpoint('b')).toBe('arg0')
    expect(r.resolveEndpoint('c')).toBe('c')   // visible -> itself
  })

  it('re-points an edge from a visible entity to the collapsed arg node', () => {
    const ve = r.visibleEdges.find(v => v.edge.id === 'e1')!
    expect(ve.sourceId).toBe('arg0')           // b -> arg0
    expect(ve.targetId).toBe('c')
  })

  it('drops an edge internal to one collapsed argument', () => {
    const nodes2 = [entity('a'), entity('b')]
    const edges2 = [edge('e1', 'a', 'b')]
    const blobs2 = [blob('arg0', ['a', 'b'])]
    const m2 = buildGraphModel(nodes2, edges2, blobs2)
    const pos2 = new Map([['a', { x: 0, y: 0 }], ['b', { x: 5, y: 0 }]])
    const r2 = computeCollapse(m2, pos2, 1, 70)
    expect(r2.visibleEdges.find(v => v.edge.id === 'e1')).toBeUndefined()
  })

  it('provides a centroid for each collapsed argument', () => {
    const c = r.argCentroids.get('arg0')!
    expect(c.x).toBeCloseTo(2.5)
    expect(c.y).toBeCloseTo(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/collapse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/graph/collapse.ts
import type { GraphEdge, GraphNode } from '../types'
import type { GraphModel } from './graphModel'
import { BLOB_PAD } from './blobGeometry'

export interface ResolvedEdge { edge: GraphEdge; sourceId: string; targetId: string }

export interface CollapseResult {
  collapsedArgIds: Set<string>
  hiddenEntityIds: Set<string>
  argCentroids: Map<string, { x: number; y: number }>
  resolveEndpoint: (entityId: string) => string
  visibleEdges: ResolvedEdge[]
}

const endId = (e: GraphEdge, which: 'source' | 'target'): string => {
  const v = e[which]
  return typeof v === 'string' ? v : (v as GraphNode).id
}

export function computeCollapse(
  model: GraphModel,
  positions: Map<string, { x: number; y: number }>,
  k: number,
  threshold = 70,
): CollapseResult {
  const collapsedArgIds = new Set<string>()
  const argCentroids = new Map<string, { x: number; y: number }>()

  for (const arg of model.arguments) {
    const pts = (model.argMembers.get(arg.id) ?? [])
      .map(id => positions.get(id))
      .filter((p): p is { x: number; y: number } => p !== undefined)
    if (pts.length === 0) continue
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    const spread = Math.max(0, ...pts.map(p => Math.hypot(p.x - cx, p.y - cy)))
    const onScreen = (spread + BLOB_PAD) * 2 * k
    if (onScreen < threshold) {
      collapsedArgIds.add(arg.id)
      argCentroids.set(arg.id, { x: cx, y: cy })
    }
  }

  // An entity hides as soon as ANY argument containing it collapses
  const hiddenEntityIds = new Set<string>()
  for (const argId of collapsedArgIds) {
    for (const eid of model.argMembers.get(argId) ?? []) hiddenEntityIds.add(eid)
  }

  // Resolve a hidden entity to the nearest collapsed argument node it belongs to
  const resolveEndpoint = (entityId: string): string => {
    if (!hiddenEntityIds.has(entityId)) return entityId
    const candidates = (model.entityArgs.get(entityId) ?? []).filter(a => collapsedArgIds.has(a))
    if (candidates.length === 0) return entityId
    if (candidates.length === 1) return candidates[0]
    const p = positions.get(entityId)
    if (!p) return candidates[0]
    let best = candidates[0], bestD = Infinity
    for (const a of candidates) {
      const c = argCentroids.get(a)!
      const d = Math.hypot(c.x - p.x, c.y - p.y)
      if (d < bestD) { bestD = d; best = a }
    }
    return best
  }

  const visibleEdges: ResolvedEdge[] = []
  for (const edge of model.edges) {
    const sourceId = resolveEndpoint(endId(edge, 'source'))
    const targetId = resolveEndpoint(endId(edge, 'target'))
    if (sourceId === targetId) continue   // internal to one collapsed argument
    visibleEdges.push({ edge, sourceId, targetId })
  }

  return { collapsedArgIds, hiddenEntityIds, argCentroids, resolveEndpoint, visibleEdges }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/collapse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/graph/collapse.ts src/graph/collapse.test.ts
git commit -m "feat(graph): add per-argument collapse with edge re-pointing"
```

---

## Task 5: Concept orbit

**Files:**
- Create: `src/graph/conceptOrbit.ts`
- Test: `src/graph/conceptOrbit.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/graph/conceptOrbit.test.ts
import { describe, it, expect } from 'vitest'
import { ringRadius, computeConceptTargets, stepRingBodies, spiralPath, type RingBody } from './conceptOrbit'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

const entity = (id: string): GraphNode => ({ id, type: 'Entity', label: id, confidence: 1 })
const edge = (id: string, s: string, t: string): GraphEdge =>
  ({ id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causal' })
const blob = (id: string, entityIds: string[], concept: string): ArgumentBlob => ({
  id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: [concept],
})

describe('ringRadius', () => {
  it('encloses the farthest point plus margin', () => {
    const r = ringRadius([{ x: 0, y: 0 }, { x: 300, y: 0 }], { x: 0, y: 0 }, 50)
    expect(r).toBe(350)
  })
})

describe('computeConceptTargets', () => {
  const nodes = [entity('a'), entity('b'), entity('c'), entity('d')]
  const edges = [edge('e1', 'a', 'b')]
  const blobs = [blob('arg0', ['a', 'b'], 'C1'), blob('arg1', ['c', 'd'], 'C2')]
  const model = buildGraphModel(nodes, edges, blobs)

  it('only shows concepts that have a collapsed argument', () => {
    const collapsed = new Set(['arg0'])
    const centroids = new Map([['arg0', { x: 100, y: 0 }]])
    const r = computeConceptTargets(model, collapsed, centroids, { x: 0, y: 0 })
    expect([...r.visibleConceptIds]).toEqual(['concept-C1'])
  })

  it('targets the angle pointing toward the collapsed argument', () => {
    const collapsed = new Set(['arg0'])
    const centroids = new Map([['arg0', { x: 0, y: 100 }]]) // straight up
    const r = computeConceptTargets(model, collapsed, centroids, { x: 0, y: 0 })
    expect(r.targetAngles.get('concept-C1')!).toBeCloseTo(Math.PI / 2)
  })
})

describe('stepRingBodies', () => {
  it('moves a body toward its target angle', () => {
    const bodies = new Map<string, RingBody>([['c', { id: 'c', angle: 0, vAngle: 0 }]])
    const targets = new Map([['c', 1]])
    for (let i = 0; i < 200; i++) stepRingBodies(bodies, targets, new Map())
    expect(bodies.get('c')!.angle).toBeCloseTo(1, 1)
  })

  it('pins a body at a fixed angle', () => {
    const bodies = new Map<string, RingBody>([['c', { id: 'c', angle: 0, vAngle: 0 }]])
    stepRingBodies(bodies, new Map([['c', 1]]), new Map([['c', 2]]))
    expect(bodies.get('c')!.angle).toBe(2)
    expect(bodies.get('c')!.vAngle).toBe(0)
  })
})

describe('spiralPath', () => {
  it('starts at the concept and ends at the argument', () => {
    const d = spiralPath(100, 0, 50, 0, 0, 0, 1)
    expect(d).toMatch(/^M 100 0/)
    expect(d.trim().endsWith('50 0')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/conceptOrbit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/graph/conceptOrbit.ts
import type { GraphModel } from './graphModel'

export interface RingBody { id: string; angle: number; vAngle: number }

export function ringRadius(
  positions: Iterable<{ x: number; y: number }>,
  center: { x: number; y: number },
  margin: number,
): number {
  let max = 0
  for (const p of positions) max = Math.max(max, Math.hypot(p.x - center.x, p.y - center.y))
  return max + margin
}

export interface ConceptTargets {
  visibleConceptIds: Set<string>
  targetAngles: Map<string, number>   // radians
}

// A concept is visible when >=1 of its arguments has collapsed. Its target angle
// points from the graph center toward the centroid of its collapsed arguments.
export function computeConceptTargets(
  model: GraphModel,
  collapsedArgIds: Set<string>,
  argCentroids: Map<string, { x: number; y: number }>,
  center: { x: number; y: number },
): ConceptTargets {
  const visibleConceptIds = new Set<string>()
  const targetAngles = new Map<string, number>()

  for (const [conceptId, argIds] of model.conceptArgs) {
    const collapsed = argIds.filter(a => collapsedArgIds.has(a))
    if (collapsed.length === 0) continue
    visibleConceptIds.add(conceptId)
    let sx = 0, sy = 0
    for (const a of collapsed) {
      const c = argCentroids.get(a)!
      sx += c.x; sy += c.y
    }
    const cx = sx / collapsed.length, cy = sy / collapsed.length
    targetAngles.set(conceptId, Math.atan2(cy - center.y, cx - center.x))
  }
  return { visibleConceptIds, targetAngles }
}

const TAU = Math.PI * 2
// Shortest signed angular difference (a - b) in (-PI, PI]
function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

export interface RingStepOptions {
  spring?: number
  minGap?: number       // min angular separation (radians)
  repelStrength?: number
  damping?: number
}

export function stepRingBodies(
  bodies: Map<string, RingBody>,
  targets: Map<string, number>,
  pinned: Map<string, number>,
  opts: RingStepOptions = {},
): void {
  const spring = opts.spring ?? 0.12
  const minGap = opts.minGap ?? 0.18
  const repel = opts.repelStrength ?? 0.04
  const damping = opts.damping ?? 0.7

  for (const [id, ang] of pinned) {
    const b = bodies.get(id)
    if (b) { b.angle = ang; b.vAngle = 0 }
  }
  for (const b of bodies.values()) {
    if (pinned.has(b.id)) continue
    const t = targets.get(b.id)
    if (t !== undefined) b.vAngle += angleDiff(t, b.angle) * spring
  }
  const arr = [...bodies.values()]
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], c = arr[j]
      const diff = angleDiff(a.angle, c.angle)
      const mag = Math.abs(diff)
      if (mag < minGap && mag > 1e-6) {
        const push = (repel * (minGap - mag)) / mag
        if (!pinned.has(a.id)) a.vAngle += diff * push
        if (!pinned.has(c.id)) c.vAngle -= diff * push
      }
    }
  }
  for (const b of bodies.values()) {
    if (pinned.has(b.id)) continue
    b.vAngle *= damping
    b.angle += b.vAngle
  }
}

// Cubic-bezier spiral: tangential offset at the concept (ring) end, curving
// inward to the argument node. tOff/rOff are screen px converted to graph units via k.
export function spiralPath(
  cx: number, cy: number, ax: number, ay: number,
  gcx: number, gcy: number, k: number,
): string {
  const dcx = cx - gcx, dcy = cy - gcy
  const dist = Math.hypot(dcx, dcy) || 1
  const radX = dcx / dist, radY = dcy / dist
  const tanX = -radY, tanY = radX
  const tOff = 28 / k
  const rOff = 16 / k
  return `M ${cx} ${cy} C ${cx + tanX * tOff} ${cy + tanY * tOff} ${ax + radX * rOff} ${ay + radY * rOff} ${ax} ${ay}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/conceptOrbit.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/graph/conceptOrbit.ts src/graph/conceptOrbit.test.ts
git commit -m "feat(graph): add global concept orbit with ring bodies and spiral links"
```

---

## Task 6: Simulation forces

**Files:**
- Create: `src/graph/forces.ts`
- Test: `src/graph/forces.test.ts`

This task implements the chain placement and the argument-arrangement optimizer. `argLayoutForce` realizes the spec's **argCohesion** (radial compactness), **argFan** (even angular spread), and **orientation** (fan biased away from neighbouring arguments) in one force operating on each argument's solo members.

- [ ] **Step 1: Write the failing test**

```typescript
// src/graph/forces.test.ts
import { describe, it, expect } from 'vitest'
import { computeChainCenters, chainHomeForce, argLayoutForce, bridgePullForce, blobRepulsionForce } from './forces'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

const entity = (id: string, x = 0, y = 0): GraphNode =>
  ({ id, type: 'Entity', label: id, confidence: 1, x, y, vx: 0, vy: 0 })
const edge = (id: string, s: string, t: string): GraphEdge =>
  ({ id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causal' })
const blob = (id: string, entityIds: string[]): ArgumentBlob => ({
  id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: ['C1'],
})

describe('computeChainCenters', () => {
  it('puts the largest chain at canvas center', () => {
    const nodes = [entity('a'), entity('b'), entity('c'), entity('d')]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')] // chain {a,b,c} size 3, {d} size 1
    const model = buildGraphModel(nodes, edges, [])
    const centers = computeChainCenters(model, 1000, 800)
    const big = model.chainsBySize[0]
    expect(centers.get(big)!).toEqual({ x: 500, y: 400 })
  })
})

describe('chainHomeForce', () => {
  it('pulls an off-center entity toward its chain center', () => {
    const nodes = [entity('a', 900, 700), entity('b', 905, 700)]
    const edges = [edge('e1', 'a', 'b')]
    const model = buildGraphModel(nodes, edges, [])
    const centers = computeChainCenters(model, 1000, 800) // single chain -> center (500,400)
    const force = chainHomeForce(model, centers, nodes)
    force(1)
    expect(nodes[0].vx!).toBeLessThan(0) // pulled left toward x=500
    expect(nodes[0].vy!).toBeLessThan(0) // pulled up toward y=400
  })
})

describe('argLayoutForce', () => {
  it('pulls scattered solo members toward their argument centroid region', () => {
    const nodes = [entity('a', -300, 0), entity('b', 300, 0), entity('c', 0, 5)]
    const edges = [edge('e1', 'a', 'c'), edge('e2', 'b', 'c')]
    const model = buildGraphModel(nodes, edges, [blob('arg0', ['a', 'b', 'c'])])
    const force = argLayoutForce(model, nodes)
    force(1)
    // 'a' is far left of the centroid (~0,1.7); the force should nudge it rightward (inward)
    expect(nodes[0].vx!).toBeGreaterThan(0)
  })
})

describe('bridgePullForce', () => {
  it('pulls a bridge entity toward the midpoint of its two arguments', () => {
    // bridge 'b' between arg0 (a,b near x=0) and arg1 (b,c near x=200)
    const nodes = [entity('a', 0, 0), entity('b', 0, 0), entity('c', 200, 0)]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]
    const model = buildGraphModel(nodes, edges, [blob('arg0', ['a', 'b']), blob('arg1', ['b', 'c'])])
    const force = bridgePullForce(model, nodes)
    force(1)
    expect(nodes[1].vx!).toBeGreaterThan(0) // 'b' pulled right toward arg1
  })
})

describe('blobRepulsionForce', () => {
  it('pushes a non-member entity out of an argument members area', () => {
    const nodes = [entity('a', 0, 0), entity('b', 10, 0), entity('x', 5, 1)] // x sits inside arg0
    const edges = [edge('e1', 'a', 'b')]
    const model = buildGraphModel(nodes, edges, [blob('arg0', ['a', 'b'])])
    const force = blobRepulsionForce(model, nodes)
    force(1)
    expect(Math.hypot(nodes[2].vx!, nodes[2].vy!)).toBeGreaterThan(0) // x gets pushed
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/forces.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/graph/forces.ts
import type { GraphNode } from '../types'
import type { GraphModel } from './graphModel'
import { BLOB_PAD } from './blobGeometry'

type Vec = { x: number; y: number }
type Force = (alpha: number) => void

const indexNodes = (nodes: GraphNode[]) => new Map(nodes.map(n => [n.id, n]))

// Largest chain at canvas center; remaining chains on concentric rings, biggest first.
export function computeChainCenters(model: GraphModel, width: number, height: number): Map<string, Vec> {
  const cx = width / 2, cy = height / 2
  const baseR = Math.min(width, height) * 0.3
  const centers = new Map<string, Vec>()
  model.chainsBySize.forEach((id, idx) => {
    if (idx === 0) { centers.set(id, { x: cx, y: cy }); return }
    const ring = Math.floor((idx - 1) / 7)
    const slot = (idx - 1) % 7
    const angle = (slot / 7) * Math.PI * 2
    const r = baseR + ring * 220
    centers.set(id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r })
  })
  return centers
}

export function chainHomeForce(
  model: GraphModel,
  centers: Map<string, Vec>,
  nodes: GraphNode[],
  strength = 0.06,
): Force {
  const maxSize = Math.max(1, ...model.chainSizes.values())
  return (alpha: number) => {
    for (const n of nodes) {
      const chain = model.chainOf.get(n.id)
      if (!chain) continue
      const home = centers.get(chain)
      if (!home) continue
      const s = strength * alpha * Math.sqrt((model.chainSizes.get(chain) ?? 1) / maxSize)
      n.vx = (n.vx ?? 0) + (home.x - (n.x ?? 0)) * s
      n.vy = (n.vy ?? 0) + (home.y - (n.y ?? 0)) * s
    }
  }
}

// Argument layout: realizes cohesion (radial), fan (even angular spread) and
// orientation (fan biased away from neighbouring argument centroids).
export function argLayoutForce(model: GraphModel, nodes: GraphNode[], strength = 0.12): Force {
  const byId = indexNodes(nodes)
  return (alpha: number) => {
    // Current centroid of each argument
    const centroid = new Map<string, Vec>()
    for (const arg of model.arguments) {
      const members = (model.argMembers.get(arg.id) ?? []).map(id => byId.get(id)).filter(Boolean) as GraphNode[]
      if (members.length === 0) continue
      centroid.set(arg.id, {
        x: members.reduce((s, n) => s + (n.x ?? 0), 0) / members.length,
        y: members.reduce((s, n) => s + (n.y ?? 0), 0) / members.length,
      })
    }
    for (const arg of model.arguments) {
      const c = centroid.get(arg.id)
      if (!c) continue
      const memberIds = model.argMembers.get(arg.id) ?? []
      const solo = memberIds.filter(id => model.soloEntities.has(id))
      if (solo.length === 0) continue

      // Orientation: direction AWAY from other arguments in the same chain
      const chain = model.chainOf.get(memberIds[0])
      let awayX = 0, awayY = 0
      for (const other of model.arguments) {
        if (other.id === arg.id) continue
        if (model.chainOf.get((model.argMembers.get(other.id) ?? [''])[0]) !== chain) continue
        const oc = centroid.get(other.id)
        if (!oc) continue
        const dx = c.x - oc.x, dy = c.y - oc.y
        const d = Math.hypot(dx, dy) || 1
        awayX += dx / (d * d); awayY += dy / (d * d)
      }
      const base = (awayX === 0 && awayY === 0) ? 0 : Math.atan2(awayY, awayX)

      // Compact target radius grows slowly with member count
      const radius = 18 + Math.sqrt(solo.length) * 10
      const span = Math.PI * 1.2 // fan width
      solo.forEach((id, i) => {
        const n = byId.get(id)
        if (!n) return
        const frac = solo.length === 1 ? 0 : i / (solo.length - 1) - 0.5
        const angle = base + frac * span
        const tx = c.x + Math.cos(angle) * radius
        const ty = c.y + Math.sin(angle) * radius
        n.vx = (n.vx ?? 0) + (tx - (n.x ?? 0)) * strength * alpha
        n.vy = (n.vy ?? 0) + (ty - (n.y ?? 0)) * strength * alpha
      })
    }
  }
}

export function bridgePullForce(model: GraphModel, nodes: GraphNode[], strength = 0.15): Force {
  const byId = indexNodes(nodes)
  return (alpha: number) => {
    const centroid = new Map<string, Vec>()
    for (const arg of model.arguments) {
      const members = (model.argMembers.get(arg.id) ?? []).map(id => byId.get(id)).filter(Boolean) as GraphNode[]
      if (members.length === 0) continue
      centroid.set(arg.id, {
        x: members.reduce((s, n) => s + (n.x ?? 0), 0) / members.length,
        y: members.reduce((s, n) => s + (n.y ?? 0), 0) / members.length,
      })
    }
    for (const eid of model.bridgeEntities) {
      const n = byId.get(eid)
      if (!n) continue
      const argIds = model.entityArgs.get(eid) ?? []
      let mx = 0, my = 0, cnt = 0
      for (const a of argIds) {
        const c = centroid.get(a)
        if (c) { mx += c.x; my += c.y; cnt++ }
      }
      if (cnt === 0) continue
      mx /= cnt; my /= cnt
      n.vx = (n.vx ?? 0) + (mx - (n.x ?? 0)) * strength * alpha
      n.vy = (n.vy ?? 0) + (my - (n.y ?? 0)) * strength * alpha
    }
  }
}

export function blobRepulsionForce(model: GraphModel, nodes: GraphNode[], strength = 0.12): Force {
  const byId = indexNodes(nodes)
  const R = BLOB_PAD + 10
  return (alpha: number) => {
    for (const arg of model.arguments) {
      const memberSet = new Set(model.argMembers.get(arg.id) ?? [])
      for (const mid of memberSet) {
        const m = byId.get(mid)
        if (!m) continue
        const mx = m.x ?? 0, my = m.y ?? 0
        for (const n of nodes) {
          if (memberSet.has(n.id)) continue
          const dx = (n.x ?? 0) - mx, dy = (n.y ?? 0) - my
          if (Math.abs(dx) > R || Math.abs(dy) > R) continue
          const dist = Math.hypot(dx, dy) || 1
          if (dist < R) {
            const f = ((R - dist) / dist) * strength * alpha
            n.vx = (n.vx ?? 0) + dx * f
            n.vy = (n.vy ?? 0) + dy * f
          }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/forces.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/graph/forces.ts src/graph/forces.test.ts
git commit -m "feat(graph): add chain placement and argument-arrangement forces"
```

---

## Task 7: Rewrite the orchestrator hook

**Files:**
- Rewrite: `src/views/GraphView/useGraphD3.ts`
- Verify (no edits needed): `src/views/GraphView/GraphView.tsx`, `src/views/GraphView/NodeFloatingCard.tsx`

The hook is DOM/D3-heavy and is verified manually in the running app rather than by unit test. It keeps the existing chevron edge rendering style (per project convention) and the existing public contract.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/views/GraphView/useGraphD3.ts` with:

```typescript
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState, ArgumentBlob } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'
import { buildGraphModel } from '../../graph/graphModel'
import { computeBlobPath } from '../../graph/blobGeometry'
import {
  computeChainCenters, chainHomeForce, argLayoutForce, bridgePullForce, blobRepulsionForce,
} from '../../graph/forces'
import { computeCollapse } from '../../graph/collapse'
import {
  ringRadius, computeConceptTargets, stepRingBodies, spiralPath, type RingBody,
} from '../../graph/conceptOrbit'
import { stepSoftBodies, type SoftBody } from '../../graph/softBodies'

// ── Chevron geometry (unchanged style) ─────────────────────────────────────────
const CHEV_HALF_H = 6
const CHEV_TIP_OFFSET = 8
const CHEV_SPACING = 20
const CHEV_TIP_REACH = 8
const CHEV_COUNT = 28
const CHEV_START = -28

const ENTITY_R = 8
const ARG_NODE_R = 8          // collapsed argument node radius, graph units (= entity size)
const COLLAPSE_PX = 70
const ORBIT_MARGIN = 160

interface HoverPayload { type: 'node'; node: GraphNode; x: number; y: number }
interface EdgeHoverPayload { type: 'edge'; edge: GraphEdge; sourceNode: GraphNode; targetNode: GraphNode; x: number; y: number }
interface BlobHoverPayload { type: 'blob'; blob: ArgumentBlob; x: number; y: number }
export type HoverItem = HoverPayload | EdgeHoverPayload | BlobHoverPayload | null

interface Options {
  filters: FilterState
  selectedNodeId: string | null
  blobs: ArgumentBlob[]
  showBlobs: boolean
  selectedArgumentId: string | null
  onNodeClick: (node: GraphNode) => void
  onBlobClick: (blob: ArgumentBlob) => void
  onHover?: (item: HoverItem) => void
  onCanvasClick?: () => void
}

function chevronOuterPoints(len: number): string {
  const bodyEnd = Math.max(0, len - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${len},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}
function edgeStroke(group: string): string {
  return group === 'structural' ? '#64748b' : RELATION_COLORS[group]
}
function edgeFill(group: string): string {
  return group === 'structural' ? 'none' : `${RELATION_COLORS[group]}0f`
}

export function useGraphD3(
  svgRef: RefObject<SVGSVGElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: Options,
) {
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge>>()
  const optsRef = useRef(opts)
  optsRef.current = opts
  const zoomKRef = useRef(1)
  const argBodiesRef = useRef(new Map<string, SoftBody>())
  const argPinnedRef = useRef(new Map<string, { x: number; y: number }>())
  const conceptBodiesRef = useRef(new Map<string, RingBody>())
  const conceptPinnedRef = useRef(new Map<string, number>())

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    argBodiesRef.current.clear()
    argPinnedRef.current.clear()
    conceptBodiesRef.current.clear()
    conceptPinnedRef.current.clear()
    svg.style('background', '#fafbfc')
    let alive = true

    svg.on('click', () => optsRef.current.onCanvasClick?.())

    // ── Model ────────────────────────────────────────────────────────────────
    const { minConfidence, relationTypes, nodeTypes } = optsRef.current.filters
    const fEdges = edges.filter(e =>
      e.confidence >= minConfidence && relationTypes[e.relation_type] !== false)
    const model = buildGraphModel(nodes, fEdges, optsRef.current.blobs)

    const simNodes: GraphNode[] = model.entities
      .filter(n => nodeTypes.Entity)
      .map(n => ({ ...n }))
    const simNodeIds = new Set(simNodes.map(n => n.id))
    const simEdges: GraphEdge[] = model.edges
      .filter(e => {
        const s = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
        const t = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        return simNodeIds.has(s) && simNodeIds.has(t)
      })
      .map(e => ({ ...e }))

    const centers = computeChainCenters(model, width, height)
    // Pre-position each entity near its chain center
    simNodes.forEach(n => {
      const home = centers.get(model.chainOf.get(n.id)!) ?? { x: width / 2, y: height / 2 }
      const spread = Math.sqrt(model.chainSizes.get(model.chainOf.get(n.id)!) ?? 1) * 30
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * spread
      n.x = home.x + Math.cos(a) * r
      n.y = home.y + Math.sin(a) * r
      n.vx = 0; n.vy = 0
    })

    // ── Layers ───────────────────────────────────────────────────────────────
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const defs = svg.append('defs')
    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 14; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2).attr('r', i * 240)
        .attr('fill', 'none').attr('stroke', 'rgba(7,59,76,0.35)')
        .attr('stroke-width', 1).attr('stroke-dasharray', '4 8')
    }
    const blobG = zoomG.append('g').attr('class', 'blobs')
    const conceptEdgeG = zoomG.append('g').attr('class', 'concept-edges')
    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')
    const argNodeG = zoomG.append('g').attr('class', 'arg-nodes')
    const conceptNodeG = zoomG.append('g').attr('class', 'concept-nodes')

    // ── Zoom ─────────────────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (e) => { zoomG.attr('transform', e.transform); zoomKRef.current = e.transform.k })
    svg.call(zoom)

    // ── Edge groups (chevron style) ───────────────────────────────────────────
    const edgeGroups = edgeG.selectAll<SVGGElement, GraphEdge>('g.edge-group')
      .data(simEdges, d => d.id).join('g').attr('class', 'edge-group').style('cursor', 'pointer')
    edgeGroups.each(function (d) {
      const g = d3.select(this)
      defs.append('clipPath').attr('id', `edgeclip-${d.id}`).attr('clipPathUnits', 'userSpaceOnUse')
        .append('polygon').attr('points', chevronOuterPoints(0))
      g.append('polygon').attr('class', 'chevron-outer')
        .attr('fill', edgeFill(d.group)).attr('stroke', edgeStroke(d.group))
        .attr('stroke-width', 1).attr('stroke-linejoin', 'miter').attr('opacity', 0.85)
      const inner = g.append('g').attr('clip-path', `url(#edgeclip-${d.id})`).append('g')
      for (let i = 0; i < CHEV_COUNT; i++) {
        const bx = CHEV_START + i * CHEV_SPACING
        inner.append('polyline')
          .attr('points', `${bx},${-CHEV_HALF_H} ${bx + CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`)
          .attr('fill', 'none').attr('stroke', RELATION_COLORS[d.group])
          .attr('stroke-width', 3).attr('opacity', 0.65)
      }
      g.append('title').text(`${d.relation_type} · ${d.confidence.toFixed(2)}`)
    })
    edgeGroups
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({
          type: 'edge', edge: d, sourceNode: d.source as GraphNode, targetNode: d.target as GraphNode, x: mx, y: my,
        })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))

    // ── Blobs ─────────────────────────────────────────────────────────────────
    const blobPaths = blobG.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
      .data(model.arguments, d => d.id).join('path').attr('class', 'blob')
      .attr('fill', 'rgba(100,116,139,0.04)').attr('stroke', 'rgba(100,116,139,0.12)')
      .attr('stroke-width', 1.5).attr('pointer-events', 'fill').style('cursor', 'pointer')
      .on('click', (event, d) => { event.stopPropagation(); optsRef.current.onBlobClick(d) })
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke', 'rgba(100,116,139,0.45)').attr('fill', 'rgba(100,116,139,0.13)')
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'blob', blob: d, x: mx, y: my })
      })
      .on('mouseleave', function (_, d) {
        const sel = optsRef.current.selectedArgumentId === d.id
        d3.select(this)
          .attr('stroke', sel ? 'rgba(100,116,139,0.6)' : 'rgba(100,116,139,0.12)')
          .attr('fill', sel ? 'rgba(100,116,139,0.13)' : 'rgba(100,116,139,0.04)')
        optsRef.current.onHover?.(null)
      })

    // Blob drag: move members, soft-anchor on release
    interface DragMember { node: GraphNode; relX: number; relY: number }
    let dragMembers: DragMember[] = []
    let dragCX = 0, dragCY = 0, dragSX = 0, dragSY = 0
    blobPaths.call(
      d3.drag<SVGPathElement, ArgumentBlob>()
        .on('start', (event, d) => {
          event.sourceEvent.stopPropagation()
          if (!event.active) sim.alphaTarget(0.3).restart()
          dragSX = event.x; dragSY = event.y
          const members = (model.argMembers.get(d.id) ?? [])
            .map(id => simNodes.find(n => n.id === id)).filter((n): n is GraphNode => !!n)
          dragCX = members.reduce((s, n) => s + (n.x ?? 0), 0) / (members.length || 1)
          dragCY = members.reduce((s, n) => s + (n.y ?? 0), 0) / (members.length || 1)
          dragMembers = members.map(n => ({ node: n, relX: (n.x ?? 0) - dragCX, relY: (n.y ?? 0) - dragCY }))
          dragMembers.forEach(({ node }) => { node.fx = node.x; node.fy = node.y })
        })
        .on('drag', (event) => {
          const ncx = dragCX + (event.x - dragSX), ncy = dragCY + (event.y - dragSY)
          dragMembers.forEach(({ node, relX, relY }) => { node.fx = ncx + relX; node.fy = ncy + relY })
        })
        .on('end', (event) => {
          if (!event.active) sim.alphaTarget(0)
          dragMembers.forEach(({ node }) => { node.fx = null; node.fy = null; node.vx = 0; node.vy = 0 })
          dragMembers = []
        }),
    )

    // ── Entity nodes ───────────────────────────────────────────────────────────
    const nodeGroups = nodeG.selectAll<SVGGElement, GraphNode>('g')
      .data(simNodes, d => d.id).join('g').style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null }),
      )
      .on('click', (event, d) => { event.stopPropagation(); optsRef.current.onNodeClick(d) })
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'node', node: d, x: mx, y: my })
        d3.select(event.currentTarget as SVGGElement).select('.node-label').attr('opacity', 1)
      })
      .on('mouseleave', (event) => {
        optsRef.current.onHover?.(null)
        d3.select(event.currentTarget as SVGGElement).select('.node-label').attr('opacity', 0)
      })
    nodeGroups.each(function (d) {
      const g = d3.select(this)
      g.append('circle').attr('r', ENTITY_R).attr('fill', '#118ab2')
      g.append('title').text(d.label)
      g.append('text').attr('class', 'node-label').attr('y', 20).attr('text-anchor', 'middle')
        .attr('pointer-events', 'none').attr('fill', '#118ab2').attr('font-size', '8px')
        .attr('font-weight', '600').attr('opacity', 0).text(d.label)
    })

    // ── Collapsed argument nodes ────────────────────────────────────────────────
    const argNodeGroups = argNodeG.selectAll<SVGGElement, ArgumentBlob>('g.arg-node')
      .data(model.arguments, d => d.id).join('g').attr('class', 'arg-node')
      .style('display', 'none').style('cursor', 'pointer')
      .on('click', (event, d) => { event.stopPropagation(); optsRef.current.onBlobClick(d) })
      .on('mouseenter', function (event, d) {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'blob', blob: d, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))
      .call(
        d3.drag<SVGGElement, ArgumentBlob>()
          .on('start', (event) => event.sourceEvent.stopPropagation())
          .on('drag', (event, d) => { argPinnedRef.current.set(d.id, { x: event.x, y: event.y }) })
          .on('end', () => {/* stays pinned */}),
      )
    argNodeGroups.each(function (d) {
      const g = d3.select(this)
      g.append('rect').attr('x', -ARG_NODE_R).attr('y', -ARG_NODE_R)
        .attr('width', ARG_NODE_R * 2).attr('height', ARG_NODE_R * 2).attr('rx', 3)
        .attr('fill', 'rgba(7,59,76,0.22)').attr('stroke', 'rgba(7,59,76,0.4)').attr('stroke-width', 1)
      g.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
        .attr('pointer-events', 'none').attr('fill', 'rgba(7,59,76,0.6)')
        .attr('font-size', '9px').attr('font-weight', '700').text(d.argument_type.slice(0, 1).toUpperCase())
      g.append('title').text(d.argument_type)
    })

    // ── Concept nodes ───────────────────────────────────────────────────────────
    const conceptIds = [...model.conceptArgs.keys()]
    const conceptNodeGroups = conceptNodeG.selectAll<SVGGElement, string>('g.concept-node')
      .data(conceptIds, d => d).join('g').attr('class', 'concept-node').style('display', 'none')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, string>()
          .on('start', (event) => event.sourceEvent.stopPropagation())
          .on('drag', (event, d) => {
            const center = { x: width / 2, y: height / 2 }
            conceptPinnedRef.current.set(d, Math.atan2(event.y - center.y, event.x - center.x))
          })
          .on('end', () => {/* stays pinned */}),
      )
    conceptNodeGroups.each(function (d) {
      const g = d3.select(this); const S = 9
      g.append('polygon').attr('points', `0,${-S} ${S},0 0,${S} ${-S},0`).attr('fill', '#6366f1').attr('opacity', 0.85)
      g.append('text').attr('y', S + 8).attr('text-anchor', 'middle').attr('pointer-events', 'none')
        .attr('fill', '#6366f1').attr('font-size', '8px').attr('font-weight', '600')
        .text((model.conceptLabels.get(d) ?? '').slice(0, 18))
    })

    const conceptEdgeData = model.arguments
      .filter(a => model.argConcept.has(a.id))
      .map(a => ({ id: `cedge-${a.id}`, argId: a.id, conceptId: model.argConcept.get(a.id)! }))
    const conceptEdgeLines = conceptEdgeG.selectAll<SVGPathElement, typeof conceptEdgeData[number]>('path.concept-edge')
      .data(conceptEdgeData, d => d.id).join('path').attr('class', 'concept-edge')
      .attr('stroke', 'rgba(99,102,241,0.65)').attr('stroke-width', 2.5).attr('fill', 'none').style('display', 'none')

    // ── Simulation ──────────────────────────────────────────────────────────────
    const sim = d3.forceSimulation<GraphNode>(simNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges).id(d => d.id).strength(d => d.confidence * 0.4))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-220).theta(0.9))
      .force('collide', d3.forceCollide<GraphNode>(14).strength(0.7))
      .force('chainHome', chainHomeForce(model, centers, simNodes))
      .force('argLayout', argLayoutForce(model, simNodes))
      .force('bridge', bridgePullForce(model, simNodes))
      .force('blobRepel', blobRepulsionForce(model, simNodes))

    // ── Per-tick render ──────────────────────────────────────────────────────────
    const graphCenter = () => ({ x: width / 2, y: height / 2 })

    sim.on('tick', () => {
      if (!alive) return
      const k = zoomKRef.current
      const showBlobs = optsRef.current.showBlobs
      const entityVisible = optsRef.current.filters.nodeTypes.Entity
      const conceptVisible = optsRef.current.filters.nodeTypes.Concept

      const positions = new Map(simNodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))

      const collapse = showBlobs
        ? computeCollapse(model, positions, k, COLLAPSE_PX)
        : { collapsedArgIds: new Set<string>(), hiddenEntityIds: new Set<string>(),
            argCentroids: new Map<string, { x: number; y: number }>(),
            resolveEndpoint: (id: string) => id, visibleEdges: [] as ReturnType<typeof computeCollapse>['visibleEdges'] }

      // Entity nodes
      nodeGroups
        .style('display', d => collapse.hiddenEntityIds.has(d.id) ? 'none' : null)
        .attr('transform', d => `translate(${d.x},${d.y})`)

      // Edges: position visible (resolved) ones, hide the rest
      const resolvedById = new Map(collapse.visibleEdges.map(v => [v.edge.id, v]))
      const posOf = (id: string) =>
        positions.get(id) ?? collapse.argCentroids.get(id) ?? argBodiesRef.current.get(id)
      edgeGroups.each(function (d) {
        const sel = d3.select(this)
        if (!showBlobs) {
          const s = d.source as GraphNode, t = d.target as GraphNode
          if (s.x == null || t.x == null) return
          drawChevron(sel, s.x!, s.y!, t.x!, t.y!, d.id)
          sel.style('display', null)
          return
        }
        const rv = resolvedById.get(d.id)
        if (!rv) { sel.style('display', 'none'); return }
        const sp = posOf(rv.sourceId), tp = posOf(rv.targetId)
        if (!sp || !tp) { sel.style('display', 'none'); return }
        sel.style('display', null)
        drawChevron(sel, sp.x, sp.y, tp.x, tp.y, d.id)
      })

      // Blobs (expanded only)
      if (showBlobs) {
        blobPaths.style('display', d => collapse.collapsedArgIds.has(d.id) ? 'none' : null)
          .attr('d', d => {
            const pts = (model.argMembers.get(d.id) ?? [])
              .map(id => positions.get(id))
              .filter((p): p is { x: number; y: number } => !!p)
              .map(p => [p.x, p.y] as [number, number])
            return computeBlobPath(pts) ?? ''
          })
      } else {
        blobPaths.style('display', 'none')
      }

      // Argument soft-body nodes (collapsed)
      const argTargets = new Map<string, { x: number; y: number }>()
      for (const id of collapse.collapsedArgIds) argTargets.set(id, collapse.argCentroids.get(id)!)
      for (const id of collapse.collapsedArgIds)
        if (!argBodiesRef.current.has(id)) {
          const c = collapse.argCentroids.get(id)!
          argBodiesRef.current.set(id, { id, x: c.x, y: c.y, vx: 0, vy: 0 })
        }
      for (const id of [...argBodiesRef.current.keys()])
        if (!collapse.collapsedArgIds.has(id)) { argBodiesRef.current.delete(id); argPinnedRef.current.delete(id) }
      stepSoftBodies(argBodiesRef.current, {
        targets: argTargets, pinned: argPinnedRef.current, repelDist: 26, repelStrength: 0.5,
      })
      argNodeGroups
        .style('display', d => (showBlobs && entityVisible && collapse.collapsedArgIds.has(d.id)) ? null : 'none')
        .attr('transform', d => {
          const b = argBodiesRef.current.get(d.id)
          return b ? `translate(${b.x},${b.y})` : null
        })

      // Concepts on the global ring
      const center = graphCenter()
      const radius = ringRadius(positions.values(), center, ORBIT_MARGIN)
      const { visibleConceptIds, targetAngles } = computeConceptTargets(
        model, collapse.collapsedArgIds, collapse.argCentroids, center)
      for (const id of visibleConceptIds)
        if (!conceptBodiesRef.current.has(id))
          conceptBodiesRef.current.set(id, { id, angle: targetAngles.get(id) ?? 0, vAngle: 0 })
      for (const id of [...conceptBodiesRef.current.keys()])
        if (!visibleConceptIds.has(id)) { conceptBodiesRef.current.delete(id); conceptPinnedRef.current.delete(id) }
      stepRingBodies(conceptBodiesRef.current, targetAngles, conceptPinnedRef.current)

      const conceptPos = (id: string) => {
        const b = conceptBodiesRef.current.get(id)
        if (!b) return null
        return { x: center.x + Math.cos(b.angle) * radius, y: center.y + Math.sin(b.angle) * radius }
      }
      conceptNodeGroups
        .style('display', d => (showBlobs && conceptVisible && visibleConceptIds.has(d)) ? null : 'none')
        .attr('transform', d => {
          const p = conceptPos(d)
          return p ? `translate(${p.x},${p.y})` : null
        })
      conceptEdgeLines
        .style('display', d => (showBlobs && conceptVisible
          && collapse.collapsedArgIds.has(d.argId) && visibleConceptIds.has(d.conceptId)) ? null : 'none')
        .attr('d', d => {
          const cp = conceptPos(d.conceptId)
          const ap = argBodiesRef.current.get(d.argId)
          if (!cp || !ap) return ''
          return spiralPath(cp.x, cp.y, ap.x, ap.y, center.x, center.y, k)
        })
    })

    function drawChevron(
      sel: d3.Selection<SVGGElement, unknown, null, undefined>,
      x1: number, y1: number, x2: number, y2: number, id: string,
    ) {
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI)
      sel.attr('transform', `translate(${x1},${y1}) rotate(${angle})`)
      const pts = chevronOuterPoints(len)
      sel.select('.chevron-outer').attr('points', pts)
      d3.select(`#edgeclip-${id} polygon`).attr('points', pts)
    }

    const observer = new ResizeObserver(() => {
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      sim.alpha(0.1).restart()
      d3.select(svgEl).selectAll('.rings circle').attr('cx', w / 2).attr('cy', h / 2)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    simRef.current = sim
    return () => { alive = false; sim.stop(); observer.disconnect() }
  }, [nodes, edges, opts.filters])

  // ── Selection halo ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGGElement, GraphNode>('.nodes g').each(function (d) {
      const g = d3.select(this)
      g.select('.selection-halo').remove()
      if (d.id === optsRef.current.selectedNodeId) {
        g.insert('circle', ':first-child').attr('class', 'selection-halo')
          .attr('r', 14).attr('fill', 'none').attr('stroke', '#F4A124').attr('stroke-width', 2.5)
      }
    })
  }, [opts.selectedNodeId])

  // ── showBlobs / blob list change → reheat ──────────────────────────────────────
  useEffect(() => { simRef.current?.alpha(0.3).restart() }, [opts.showBlobs, opts.blobs])

  // ── Argument selection highlight ───────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const argId = optsRef.current.selectedArgumentId
    svg.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
      .attr('stroke', d => d.id === argId ? 'rgba(100,116,139,0.6)' : 'rgba(100,116,139,0.12)')
      .attr('fill', d => d.id === argId ? 'rgba(100,116,139,0.13)' : 'rgba(100,116,139,0.04)')
  }, [opts.selectedArgumentId])

  const reheat = () => simRef.current?.alpha(0.5).restart()
  const freeze = () => simRef.current?.stop()
  return { reheat, freeze }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run the full unit suite**

Run: `npm run test:run`
Expected: All Task 1–6 tests PASS.

- [ ] **Step 4: Manual verification in the app**

Run: `npm run dev`, open the Graph view, select documents, and confirm:
- Entities spread out; the largest chain sits at canvas center, smaller chains ring outward.
- Each argument shows a clean rounded convex cell; cells of neighbouring arguments don't badly overlap.
- Zooming out collapses small/tight arguments first into fixed-size square nodes that shrink with zoom; entities of a collapsed argument disappear and edges from surviving entities re-point to the argument node.
- Concepts appear on a single outer ring only once an argument collapses, with spiral links curving inward.
- Hovering entities, edges, blobs, argument nodes, and concept nodes all surface the floating card; blobs and collapsed argument nodes can be dragged; concept nodes drag along the ring.

- [ ] **Step 5: Commit**

```bash
git add src/views/GraphView/useGraphD3.ts
git commit -m "feat(graph): rewrite useGraphD3 as orchestrator over graph modules"
```

---

## Task 8: Remove the old blob geometry util

**Files:**
- Delete: `src/utils/blobGeometry.ts`

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `grep -rn "utils/blobGeometry" src`
Expected: no output.

- [ ] **Step 2: Delete the file**

```bash
git rm src/utils/blobGeometry.ts
```

- [ ] **Step 3: Type-check and test**

Run: `npx tsc --noEmit && npm run test:run`
Expected: No errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(graph): remove superseded utils/blobGeometry"
```

---

## Task 9: Final verification

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: No errors. Fix any unused-import or no-unused-vars findings (e.g. drop `freeze`/`GraphModel`/`computeBlobPath` if flagged unused).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: `tsc` clean and `vite build` succeeds.

- [ ] **Step 3: Full manual pass**

Re-run the Task 7 Step 4 checklist end to end, plus: toggle node-type and relation filters, change min-confidence, and click `reheat` — confirm the graph rebuilds without console errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore(graph): lint and build fixes for simulation redesign"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** entity separation + chain-by-size (Task 1 model, Task 6 `computeChainCenters`/`chainHomeForce`); argument cells with rearrangement/orientation (Task 6 `argLayoutForce`, `bridgePullForce`, `blobRepulsionForce`; Task 2 geometry); per-argument zoom collapse + re-pointing (Task 4); fixed-size collapsed nodes that shrink with zoom (Task 7, `ARG_NODE_R` in graph units, no counter-scale); soft-body arguments & concepts, all hoverable/draggable (Task 3, Task 5, Task 7); global concept orbit + spiral links (Task 5, Task 7). Deferred non-goal: tween animation.
- **Known tuning surface:** force strengths in Task 6, `COLLAPSE_PX`, `ORBIT_MARGIN`, soft-body `repelDist`, ring `minGap`. Task 7 Step 4 is where these get adjusted by eye.
- **Contract preserved:** `useGraphD3` signature, `HoverItem`, and `reheat` are unchanged, so `GraphView.tsx`/`NodeFloatingCard.tsx` stay untouched.
