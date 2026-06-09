# Argument Blobs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each argument as a convex-hull blob in the graph view, enclosing the entity nodes its SRT triplets connect, with a clustering force that activates when blobs are toggled on.

**Architecture:** `ArgumentBlob` metadata flows from `DataService.getGraph()` through `GraphView` into `useGraphD3`, which renders a dedicated `blobG` SVG layer (below edges) updated every simulation tick. Two secondary `useEffect`s manage the clustering force + show/hide (keyed on `showBlobs`) and the highlight dimming (keyed on `selectedArgumentId`). Clicking a blob sets `selectedArgumentId` in the store and opens the detail view.

**Tech Stack:** React 18, Zustand, D3 v7, TypeScript 5, Vitest

---

## File map

| File | Action |
|---|---|
| `src/types/index.ts` | Add `ArgumentBlob` interface |
| `src/data/DataService.ts` | Extend interface + `buildGraphData` + `getGraph` + `getArgumentDetail` |
| `tests/DataService.test.ts` | Replace (imports gone `MockDataService`), test `RealDataService` |
| `src/store/useStore.ts` | Add `showBlobs`, `selectedArgumentId`, setters |
| `tests/store.test.ts` | Add tests for new fields |
| `src/utils/blobGeometry.ts` | New: `computeBlobPath`, `computeCapsulePath`, `makeBlobClusterForce`, `BLOB_PAD` |
| `tests/blobGeometry.test.ts` | New: geometry unit tests |
| `src/views/GraphView/useGraphD3.ts` | Refs, `blobG` layer, tick update, two new `useEffect`s, extended `Options` |
| `src/views/GraphView/GraphView.tsx` | Blob state, toggle checkbox, updated `useGraphD3` call |
| `src/views/DetailView/DetailView.tsx` | Read `selectedArgumentId`, use it in `getArgumentDetail` |

---

## Task 1 — Add `ArgumentBlob` type

**Files:** Modify `src/types/index.ts`

- [ ] Add after the `ArgumentDetail` interface:

```ts
export interface ArgumentBlob {
  id: string                  // e.g. "doc_0_arg_3"
  entityIds: string[]         // entity node IDs from this argument's relations
  full_argument: string
  argument_type: string
  confidence: number
  source_document_id: string
  source_document_title: string
}
```

- [ ] Verify no type errors:
```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] Commit:
```bash
git add src/types/index.ts
git commit -m "feat: add ArgumentBlob type"
```

---

## Task 2 — Extend DataService with blob support

**Files:** Modify `src/data/DataService.ts`, replace `tests/DataService.test.ts`

### 2a — Update the interface

- [ ] In `DataService.ts`, add `ArgumentBlob` to the type import line:

```ts
import type { DocNode, GraphNode, GraphEdge, ArgumentDetail, ArgumentRelation, RelationGroup, ArgumentBlob } from '../types'
```

- [ ] Change `DataServiceInterface.getGraph` return type:

```ts
export interface DataServiceInterface {
  getDocuments(): Promise<DocNode[]>
  getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; blobs: ArgumentBlob[] }>
  getArgumentDetail(nodeId: string): Promise<ArgumentDetail>
}
```

### 2b — Add blob building to `buildGraphData`

- [ ] Update the `buildGraphData` return type annotation:

```ts
function buildGraphData(): {
  nodes: GraphNode[]
  edges: GraphEdge[]
  entityDocs: Map<string, Set<number>>
  rawEdges: RawEdgeRecord[]
  blobs: ArgumentBlob[]
}
```

- [ ] Add blob accumulation inside `buildGraphData`, just before the `return` statement (after the `const edges = ...` line):

```ts
const blobs: ArgumentBlob[] = []
rawDocs.forEach((doc, docIdx) => {
  const docId = makeDocId(docIdx)
  doc.data.forEach(arg => {
    const argEntityIds = new Set<string>()
    arg.relations.forEach(rel => {
      argEntityIds.add(entityId(rel.subject.trim()))
      argEntityIds.add(entityId(rel.object.trim()))
    })
    if (argEntityIds.size < 2) return
    blobs.push({
      id: `${docId}_arg_${arg.arg_id}`,
      entityIds: Array.from(argEntityIds),
      full_argument: arg.full_argument,
      argument_type: arg.argument_type,
      confidence: arg.confidence,
      source_document_id: docId,
      source_document_title: doc.source,
    })
  })
})
```

- [ ] Update the `return` statement of `buildGraphData`:

```ts
return { nodes, edges, entityDocs, rawEdges, blobs }
```

### 2c — Update `RealDataService.getGraph`

- [ ] Replace the entire `getGraph` method:

```ts
async getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; blobs: ArgumentBlob[] }> {
  const { nodes: allNodes, edges: allEdges, entityDocs, blobs: allBlobs } = CACHED_GRAPH

  if (documentIds.length === 0) return { nodes: allNodes, edges: allEdges, blobs: allBlobs }

  const selectedIdx = new Set(
    documentIds.map(id => parseInt(id.split('_')[1])).filter(n => !isNaN(n))
  )

  const relevantIds = new Set(
    Array.from(entityDocs.entries())
      .filter(([, docSet]) => [...docSet].some(idx => selectedIdx.has(idx)))
      .map(([label]) => entityId(label))
  )

  const nodes = allNodes.filter(n => relevantIds.has(n.id))
  const edges = allEdges.filter(e => {
    const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
    const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
    return relevantIds.has(sid) && relevantIds.has(tid)
  })
  const blobs = allBlobs.filter(b =>
    selectedIdx.has(parseInt(b.source_document_id.split('_')[1]))
  )

  return { nodes, edges, blobs }
}
```

### 2d — Extend `getArgumentDetail` to handle argument IDs

- [ ] Replace the current `getArgumentDetail` method with this version that handles both entity IDs and argument IDs:

```ts
async getArgumentDetail(nodeId: string): Promise<ArgumentDetail> {
  // Handle argument IDs like "doc_0_arg_3"
  const argMatch = nodeId.match(/^doc_(\d+)_arg_(\d+)$/)
  if (argMatch) {
    const docIdx = parseInt(argMatch[1])
    const argId  = parseInt(argMatch[2])
    const doc    = rawDocs[docIdx]
    const rawArg = doc?.data.find(a => a.arg_id === argId)
    if (!doc || !rawArg) throw new Error(`Argument ${nodeId} not found`)

    const docId = makeDocId(docIdx)
    const argNode: GraphNode = {
      id: nodeId,
      type: 'Argument',
      label: rawArg.full_argument.slice(0, 60) + (rawArg.full_argument.length > 60 ? '…' : ''),
      full_text: rawArg.full_argument,
      confidence: rawArg.confidence,
      source_document_id: docId,
      source_document_title: doc.source,
      page_reference: 0,
    }
    const relations: ArgumentRelation[] = rawArg.relations.map(rel => ({
      relation_type: rel.relation.toUpperCase(),
      confidence: rel.confidence,
      group: (RELATION_GROUP_MAP[rel.relation] ?? 'causal') as RelationGroup,
      source_document_id: docId,
      source_document_title: doc.source,
      page_reference: 0,
      full_predicate: `${rel.subject} ${rel.relation.replace(/_/g, ' ')} ${rel.object}`,
      target_argument_id: entityId(rel.object.trim()),
    }))
    return { argument: argNode, relations, sources: CACHED_DOCS.filter(d => d.id === docId) }
  }

  // Entity node lookup
  const { nodes: allNodes, rawEdges } = CACHED_GRAPH
  const node = allNodes.find(n => n.id === nodeId)
  if (!node) throw new Error(`Node ${nodeId} not found`)

  const involvedRaw = rawEdges.filter(
    re => entityId(re.source) === nodeId || entityId(re.target) === nodeId
  )
  const relations: ArgumentRelation[] = involvedRaw.map(re => {
    const isSource = entityId(re.source) === nodeId
    const otherId = entityId(isSource ? re.target : re.source)
    return {
      relation_type: re.relation.toUpperCase(),
      confidence: re.confidence,
      group: (RELATION_GROUP_MAP[re.relation] ?? 'causal') as RelationGroup,
      source_document_id: makeDocId(re.docIdx),
      source_document_title: rawDocs[re.docIdx].source,
      page_reference: 0,
      full_predicate: re.full_predicate,
      target_argument_id: otherId,
    }
  })
  const docIndices = new Set(involvedRaw.map(re => re.docIdx))
  const sources = CACHED_DOCS.filter(d => docIndices.has(parseInt(d.id.split('_')[1])))
  return { argument: node, relations, sources }
}
```

### 2e — Fix the test file

- [ ] Replace the entire contents of `tests/DataService.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RealDataService } from '../src/data/DataService'

const svc = new RealDataService()

describe('RealDataService.getDocuments', () => {
  it('returns 5 documents with required fields', async () => {
    const docs = await svc.getDocuments()
    expect(docs).toHaveLength(5)
    expect(docs[0]).toHaveProperty('id')
    expect(docs[0]).toHaveProperty('pca_x')
    expect(docs[0].top_terms.length).toBeGreaterThan(0)
  })
})

describe('RealDataService.getGraph', () => {
  it('returns entities, edges, and blobs when no filter', async () => {
    const { nodes, edges, blobs } = await svc.getGraph([])
    expect(nodes.length).toBeGreaterThan(0)
    expect(edges.length).toBeGreaterThan(0)
    expect(blobs.length).toBeGreaterThan(0)
    expect(nodes[0].type).toBe('Entity')
    expect(edges[0]).toHaveProperty('group')
  })

  it('filters nodes and blobs to selected documents', async () => {
    const all = await svc.getGraph([])
    const filtered = await svc.getGraph(['doc_0'])
    expect(filtered.nodes.length).toBeLessThan(all.nodes.length)
    expect(filtered.blobs.every(b => b.source_document_id === 'doc_0')).toBe(true)
  })

  it('every blob has at least 2 entityIds', async () => {
    const { blobs } = await svc.getGraph([])
    expect(blobs.every(b => b.entityIds.length >= 2)).toBe(true)
  })
})

describe('RealDataService.getArgumentDetail — entity node', () => {
  it('returns relations and sources for an entity', async () => {
    const { nodes } = await svc.getGraph([])
    const detail = await svc.getArgumentDetail(nodes[0].id)
    expect(detail.argument.id).toBe(nodes[0].id)
    expect(Array.isArray(detail.relations)).toBe(true)
    expect(detail.relations[0]).toHaveProperty('full_predicate')
  })
})

describe('RealDataService.getArgumentDetail — argument ID', () => {
  it('returns argument text and SRT relations for doc_0_arg_0', async () => {
    const detail = await svc.getArgumentDetail('doc_0_arg_0')
    expect(detail.argument.type).toBe('Argument')
    expect(detail.argument.full_text).toBeTruthy()
    expect(detail.relations.length).toBeGreaterThan(0)
    expect(detail.relations[0].full_predicate).toContain(' ')
    expect(detail.sources).toHaveLength(1)
  })

  it('relation target_argument_id is an entity ID', async () => {
    const detail = await svc.getArgumentDetail('doc_0_arg_0')
    expect(detail.relations[0].target_argument_id).toMatch(/^entity_/)
  })
})
```

- [ ] Run tests:
```bash
npx vitest run tests/DataService.test.ts
```
Expected: all 7 tests pass.

- [ ] Type-check:
```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] Commit:
```bash
git add src/data/DataService.ts src/types/index.ts tests/DataService.test.ts
git commit -m "feat: add ArgumentBlob to DataService — getGraph returns blobs, getArgumentDetail handles arg IDs"
```

---

## Task 3 — Update store

**Files:** Modify `src/store/useStore.ts`, modify `tests/store.test.ts`

- [ ] Add two fields and their setters to the `AppState` interface in `useStore.ts`:

```ts
interface AppState {
  // ... existing fields ...
  showBlobs: boolean
  selectedArgumentId: string | null
  setShowBlobs: (v: boolean) => void
  setSelectedArgumentId: (id: string | null) => void
}
```

- [ ] Add initial values and implementations to the `create` call:

```ts
showBlobs: false,
selectedArgumentId: null,
setShowBlobs: (v) => set({ showBlobs: v }),
setSelectedArgumentId: (id) => set({ selectedArgumentId: id }),
```

- [ ] Update the `beforeEach` reset in `tests/store.test.ts`:

```ts
beforeEach(() => {
  useStore.setState({
    selectedDocumentIds: [],
    selectedNodeId: null,
    activeView: 'corpus',
    showBlobs: false,
    selectedArgumentId: null,
  })
})
```

- [ ] Append these two tests to the `describe` block in `tests/store.test.ts`:

```ts
it('setShowBlobs flips the blob layer flag', () => {
  expect(useStore.getState().showBlobs).toBe(false)
  useStore.getState().setShowBlobs(true)
  expect(useStore.getState().showBlobs).toBe(true)
})

it('setSelectedArgumentId sets and clears the selection', () => {
  useStore.getState().setSelectedArgumentId('doc_0_arg_3')
  expect(useStore.getState().selectedArgumentId).toBe('doc_0_arg_3')
  useStore.getState().setSelectedArgumentId(null)
  expect(useStore.getState().selectedArgumentId).toBeNull()
})
```

- [ ] Run tests:
```bash
npx vitest run tests/store.test.ts
```
Expected: all 7 tests pass.

- [ ] Type-check and commit:
```bash
npx tsc --noEmit
git add src/store/useStore.ts tests/store.test.ts
git commit -m "feat: add showBlobs and selectedArgumentId to store"
```

---

## Task 4 — Blob geometry utilities

**Files:** Create `src/utils/blobGeometry.ts`, create `tests/blobGeometry.test.ts`

- [ ] Write failing tests first. Create `tests/blobGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeCapsulePath, computeBlobPath, makeBlobClusterForce, BLOB_PAD } from '../src/utils/blobGeometry'
import type { ArgumentBlob, GraphNode } from '../src/types'

describe('BLOB_PAD', () => {
  it('is a positive number', () => {
    expect(BLOB_PAD).toBeGreaterThan(0)
  })
})

describe('computeCapsulePath', () => {
  it('returns a non-empty SVG path string with M and Z', () => {
    const path = computeCapsulePath([0, 0], [100, 0], 20)
    expect(path).toBeTruthy()
    expect(path).toContain('M')
    expect(path).toContain('Z')
  })

  it('contains arc commands for rounded ends', () => {
    const path = computeCapsulePath([0, 0], [100, 0], 20)
    expect(path).toContain('A')
  })

  it('handles vertical orientation', () => {
    const path = computeCapsulePath([50, 0], [50, 100], 15)
    expect(path).toBeTruthy()
    expect(path).toContain('M')
  })
})

describe('computeBlobPath', () => {
  it('returns null for fewer than 3 points', () => {
    expect(computeBlobPath([[0, 0], [100, 0]], 20)).toBeNull()
  })

  it('returns a closed SVG path for a valid triangle', () => {
    const path = computeBlobPath([[0, 0], [100, 0], [50, 100]], 20)
    expect(path).toBeTruthy()
    expect(path).toContain('M')
  })

  it('returns null for collinear points (no convex hull)', () => {
    const path = computeBlobPath([[0, 0], [50, 0], [100, 0]], 20)
    expect(path).toBeNull()
  })
})

describe('makeBlobClusterForce', () => {
  it('nudges left entity right and right entity left toward centroid', () => {
    const blob: ArgumentBlob = {
      id: 'doc_0_arg_0', entityIds: ['entity_a', 'entity_b'],
      full_argument: 'test', argument_type: 'mechanistic',
      confidence: 0.9, source_document_id: 'doc_0', source_document_title: 'Test',
    }
    const nodes: GraphNode[] = [
      { id: 'entity_a', type: 'Entity', label: 'a', confidence: 1, x: 0,   y: 0, vx: 0, vy: 0 },
      { id: 'entity_b', type: 'Entity', label: 'b', confidence: 1, x: 100, y: 0, vx: 0, vy: 0 },
    ]
    const ref = { current: nodes }
    makeBlobClusterForce([blob], ref, 0.1)(1)
    expect(nodes[0].vx).toBeGreaterThan(0)   // entity_a pushed right toward x=50
    expect(nodes[1].vx).toBeLessThan(0)       // entity_b pushed left toward x=50
  })

  it('skips blobs with fewer than 2 matching nodes', () => {
    const blob: ArgumentBlob = {
      id: 'doc_0_arg_0', entityIds: ['entity_missing'],
      full_argument: 'x', argument_type: 'causal',
      confidence: 0.5, source_document_id: 'doc_0', source_document_title: 'T',
    }
    const ref = { current: [] as GraphNode[] }
    expect(() => makeBlobClusterForce([blob], ref, 0.1)(1)).not.toThrow()
  })
})
```

- [ ] Run to confirm failure:
```bash
npx vitest run tests/blobGeometry.test.ts
```
Expected: FAIL — module not found.

- [ ] Create `src/utils/blobGeometry.ts`:

```ts
import * as d3 from 'd3'
import type { ArgumentBlob, GraphNode } from '../types'

export const BLOB_PAD = 24

function expandHull(hull: [number, number][], pad: number): [number, number][] {
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return hull.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    return [x + (dx / dist) * pad, y + (dy / dist) * pad]
  })
}

const lineGen = d3.line<[number, number]>()
  .x(d => d[0])
  .y(d => d[1])
  .curve(d3.curveCatmullRomClosed.alpha(0.5))

export function computeBlobPath(points: [number, number][], pad: number): string | null {
  const hull = d3.polygonHull(points)
  if (!hull) return null
  return lineGen(expandHull(hull, pad)) ?? null
}

export function computeCapsulePath(
  p1: [number, number],
  p2: [number, number],
  pad: number
): string {
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = (-dy / len) * pad
  const ny = (dx / len) * pad
  return [
    `M ${p1[0] + nx} ${p1[1] + ny}`,
    `L ${p2[0] + nx} ${p2[1] + ny}`,
    `A ${pad} ${pad} 0 0 1 ${p2[0] - nx} ${p2[1] - ny}`,
    `L ${p1[0] - nx} ${p1[1] - ny}`,
    `A ${pad} ${pad} 0 0 1 ${p1[0] + nx} ${p1[1] + ny}`,
    'Z',
  ].join(' ')
}

export function makeBlobClusterForce(
  blobs: ArgumentBlob[],
  simNodesRef: { current: GraphNode[] },
  strength = 0.08
) {
  return function(alpha: number) {
    for (const blob of blobs) {
      const members = blob.entityIds
        .map(id => simNodesRef.current.find(n => n.id === id))
        .filter((n): n is GraphNode => n != null)
      if (members.length < 2) continue
      const cx = members.reduce((s, n) => s + (n.x ?? 0), 0) / members.length
      const cy = members.reduce((s, n) => s + (n.y ?? 0), 0) / members.length
      for (const n of members) {
        n.vx = (n.vx ?? 0) + (cx - (n.x ?? 0)) * strength * alpha
        n.vy = (n.vy ?? 0) + (cy - (n.y ?? 0)) * strength * alpha
      }
    }
  }
}
```

- [ ] Run tests:
```bash
npx vitest run tests/blobGeometry.test.ts
```
Expected: all 8 tests pass.

- [ ] Type-check and commit:
```bash
npx tsc --noEmit
git add src/utils/blobGeometry.ts tests/blobGeometry.test.ts
git commit -m "feat: blob geometry utilities — hull, capsule, cluster force"
```

---

## Task 5 — Update `useGraphD3` — blob layer, tick, and effects

**Files:** Modify `src/views/GraphView/useGraphD3.ts`

This task has five sub-steps applied to the existing ~528-line file. Read it before editing.

### 5a — Add imports and extend `Options`

- [ ] Add to the existing import from `../../types`:
```ts
import type { GraphNode, GraphEdge, FilterState, ArgumentBlob } from '../../types'
```

- [ ] Add a new import line below the existing imports:
```ts
import { computeBlobPath, computeCapsulePath, makeBlobClusterForce, BLOB_PAD } from '../../utils/blobGeometry'
```

- [ ] Replace the `Options` interface:

```ts
interface Options {
  filters: FilterState
  selectedNodeId: string | null
  selectedArgumentId: string | null
  blobs: ArgumentBlob[]
  showBlobs: boolean
  onNodeClick: (node: GraphNode) => void
  onBlobClick: (blob: ArgumentBlob) => void
  onHover?: (item: HoverItem) => void
  onCanvasClick?: () => void
}
```

### 5b — Add stable refs

- [ ] Add these five refs directly below the existing `const simRef = useRef<...>()` and `const optsRef = useRef(opts)` lines:

```ts
const simNodesRef   = useRef<GraphNode[]>([])
const blobGRef      = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
const blobPathsRef  = useRef<d3.Selection<SVGPathElement, ArgumentBlob, SVGGElement, unknown> | null>(null)
const nodeGroupsRef = useRef<d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown> | null>(null)
const edgeGroupsRef = useRef<d3.Selection<SVGGElement, GraphEdge, SVGGElement, unknown> | null>(null)
```

### 5c — Inject `blobG` layer and set `simNodesRef`

- [ ] In the main `useEffect`, find the block:
```ts
const defs = svg.append('defs')
const edgeG = zoomG.append('g').attr('class', 'edges')
const nodeG = zoomG.append('g').attr('class', 'nodes')
```

Replace with:
```ts
const defs = svg.append('defs')

const blobG = zoomG.append('g').attr('class', 'blobs')
  .style('display', optsRef.current.showBlobs ? null : 'none')
blobGRef.current = blobG

const edgeG = zoomG.append('g').attr('class', 'edges')
const nodeG = zoomG.append('g').attr('class', 'nodes')
```

- [ ] Find the line `const simNodes: GraphNode[] = visibleNodes.map(n => ({ ...n }))` and add immediately after it:
```ts
simNodesRef.current = simNodes
```

### 5d — Create blob paths and set node/edge refs

- [ ] Find the comment `// Show label on hover; permanently show non-overlapping ones after sim settles` and insert the following block **just before** it:

```ts
// ── Blob paths ────────────────────────────────────────────────────────────────
const blobPaths = blobG.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
  .data(optsRef.current.blobs, d => d.id)
  .join('path')
  .attr('class', 'blob')
  .attr('fill', 'rgba(100,116,139,0.08)')
  .attr('stroke', 'rgba(100,116,139,0.35)')
  .attr('stroke-width', 1.5)
  .attr('stroke-dasharray', '4 3')
  .attr('cursor', 'pointer')
  .attr('pointer-events', 'fill')
blobPathsRef.current = blobPaths

blobPaths
  .on('mouseenter', function(_, blob) {
    if (blob.id !== optsRef.current.selectedArgumentId) {
      d3.select(this)
        .attr('fill', 'rgba(100,116,139,0.14)')
        .attr('stroke', 'rgba(100,116,139,0.65)')
    }
  })
  .on('mouseleave', function(_, blob) {
    if (blob.id !== optsRef.current.selectedArgumentId) {
      d3.select(this)
        .attr('fill', 'rgba(100,116,139,0.08)')
        .attr('stroke', 'rgba(100,116,139,0.35)')
    }
  })
  .on('click', (event, blob) => {
    event.stopPropagation()
    optsRef.current.onBlobClick(blob)
  })

nodeGroupsRef.current = nodeGroups
edgeGroupsRef.current = edgeGroups
```

### 5e — Extend the tick handler and add two new `useEffect`s

- [ ] Inside `sim.on('tick', () => { ... })`, add blob path updates as the **last** statement inside the tick callback, after `nodeGroups.attr('transform', d => ...)`:

```ts
blobPaths.attr('d', blob => {
  const pts = blob.entityIds
    .map(id => simNodesRef.current.find(n => n.id === id))
    .filter((n): n is GraphNode => n != null && n.x != null && n.y != null)
    .map(n => [n.x!, n.y!] as [number, number])
  if (pts.length < 2) return ''
  if (pts.length === 2) return computeCapsulePath(pts[0], pts[1], BLOB_PAD)
  return computeBlobPath(pts, BLOB_PAD) ?? ''
})
```

- [ ] Add the blob-toggle effect **after** the main `useEffect([nodes, edges, opts.filters])` closing brace, before the selection-halo `useEffect`:

```ts
// ── Blob toggle: show/hide layer + clustering force ───────────────────────────
useEffect(() => {
  const sim   = simRef.current
  const blobG = blobGRef.current
  if (!sim || !blobG) return

  if (opts.showBlobs) {
    sim.force('blobCluster', makeBlobClusterForce(opts.blobs, simNodesRef, 0.08))
    blobG.style('display', null)
    sim.alpha(0.3).restart()
  } else {
    sim.force('blobCluster', null)
    blobG.style('display', 'none')
    if (sim.alpha() > 0.01) sim.alpha(0.15).restart()
  }
}, [opts.showBlobs, opts.blobs])
```

- [ ] Add the argument-highlight effect **after** the blob-toggle effect, still before the selection-halo effect:

```ts
// ── Selected argument highlight ───────────────────────────────────────────────
useEffect(() => {
  const argId      = opts.selectedArgumentId
  const nodeGroups = nodeGroupsRef.current
  const edgeGroups = edgeGroupsRef.current
  const blobPaths  = blobPathsRef.current
  if (!nodeGroups || !edgeGroups || !blobPaths) return

  if (!argId) {
    nodeGroups.attr('opacity', null)
    edgeGroups.attr('opacity', null)
    blobPaths
      .attr('fill', 'rgba(100,116,139,0.08)')
      .attr('stroke', 'rgba(100,116,139,0.35)')
    return
  }

  const blob = opts.blobs.find(b => b.id === argId)
  if (!blob) return

  const blobEntitySet = new Set(blob.entityIds)
  nodeGroups.attr('opacity', (n: GraphNode) => blobEntitySet.has(n.id) ? 1 : 0.06)
  edgeGroups.attr('opacity', (e: GraphEdge) => {
    const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
    const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
    return blobEntitySet.has(sid) && blobEntitySet.has(tid) ? 1 : 0.04
  })
  blobPaths
    .attr('fill', (b: ArgumentBlob) =>
      b.id === argId ? 'rgba(100,116,139,0.16)' : 'rgba(100,116,139,0.04)'
    )
    .attr('stroke', (b: ArgumentBlob) =>
      b.id === argId ? 'rgba(100,116,139,0.7)' : 'rgba(100,116,139,0.15)'
    )
}, [opts.selectedArgumentId])
```

- [ ] Type-check:
```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] Commit:
```bash
git add src/views/GraphView/useGraphD3.ts
git commit -m "feat: blob SVG layer, tick updates, clustering force, and highlight effects in useGraphD3"
```

---

## Task 6 — Update `GraphView`

**Files:** Modify `src/views/GraphView/GraphView.tsx`

- [ ] Add `ArgumentBlob` to the type import:

```ts
import type { GraphNode, GraphEdge, ArgumentBlob } from '../../types'
```

- [ ] Add `blobs` state alongside `nodes` and `edges`:

```ts
const [nodes, setNodes] = useState<GraphNode[]>([])
const [edges, setEdges] = useState<GraphEdge[]>([])
const [blobs, setBlobs] = useState<ArgumentBlob[]>([])
```

- [ ] Extend the store destructure:

```ts
const {
  activeView, selectedDocumentIds, selectedNodeId, setSelectedNode,
  setActiveView, filters, setFilters,
  showBlobs, setShowBlobs,
  selectedArgumentId, setSelectedArgumentId,
} = useStore()
```

- [ ] Update the `getGraph` call to also set blobs:

```ts
dataService.getGraph(selectedDocumentIds).then(({ nodes, edges, blobs }) => {
  setNodes(nodes); setEdges(edges); setBlobs(blobs)
})
```

- [ ] Replace the `useGraphD3` call:

```ts
const { reheat, freeze } = useGraphD3(svgRef, nodes, edges, {
  filters,
  selectedNodeId,
  selectedArgumentId,
  blobs,
  showBlobs,
  onNodeClick: (node) => {
    setSelectedNode(node.id)
    setSelectedArgumentId(null)
    setStickyItem({ type: 'node', node, x: 0, y: 0 })
  },
  onBlobClick: (blob) => {
    setSelectedArgumentId(blob.id)
    setSelectedNode(null)
    setStickyItem(null)
    setActiveView('detail')
  },
  onHover: (item) => setHoverItem(item),
  onCanvasClick: () => {
    setSelectedNode(null)
    setSelectedArgumentId(null)
    setStickyItem(null)
  },
})
```

- [ ] Add a blob toggle section to `filterContent`, as the **first** `<div>` inside the fragment (before "Node types"):

```tsx
<div>
  <div className="sl">Argument blobs</div>
  <label style={checkRow}>
    <input
      type="checkbox"
      checked={showBlobs}
      onChange={e => setShowBlobs(e.target.checked)}
      style={{ accentColor: '#F4A124' }}
    />
    <span style={labelText}>Show argument blobs</span>
  </label>
</div>
```

- [ ] Type-check:
```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] Commit:
```bash
git add src/views/GraphView/GraphView.tsx
git commit -m "feat: wire blobs into GraphView — toggle, state, blob click handler"
```

---

## Task 7 — Update `DetailView`

**Files:** Modify `src/views/DetailView/DetailView.tsx`

- [ ] Extend the store destructure:

```ts
const {
  activeView, selectedNodeId, setSelectedNode,
  selectedArgumentId, setSelectedArgumentId,
} = useStore()
```

- [ ] Replace the `getArgumentDetail` effect:

```ts
useEffect(() => {
  const id = selectedArgumentId ?? selectedNodeId
  if (!id) return
  dataService.getArgumentDetail(id).then(setDetail)
}, [selectedArgumentId, selectedNodeId])
```

- [ ] Update the empty state message:

```tsx
if (!detail) {
  return (
    <div className={styles.empty}>
      Select a node or argument blob in the Graph view to open its detail.
    </div>
  )
}
```

- [ ] Clear `selectedArgumentId` in `navigateBack`:

```ts
const navigateBack = () => {
  if (navStack.length === 0) return
  const prevId = navStack[navStack.length - 1]
  setNavStack(s => s.slice(0, -1))
  setSelectedArgumentId(null)
  setSelectedNode(prevId)
}
```

- [ ] Run all tests:
```bash
npx vitest run
```
Expected: all tests pass.

- [ ] Type-check:
```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] Commit:
```bash
git add src/views/DetailView/DetailView.tsx
git commit -m "feat: DetailView loads argument detail from selectedArgumentId when set"
```

---

## Task 8 — Smoke test in the browser

- [ ] Start the dev server:
```bash
npm run dev
```

- [ ] Open the app and go to the Graph view. With no documents selected, verify the graph renders with entity nodes and edges.

- [ ] Open the control panel. Verify "Show argument blobs" checkbox appears and is unchecked.

- [ ] Check "Show argument blobs". Verify:
  - Blobs appear as faint dashed outlines around groups of entity nodes
  - The simulation reflows (nodes cluster slightly toward their argument centroids)

- [ ] Select one document from the corpus view, then return to graph. Verify blobs are scoped to that document's arguments.

- [ ] Click a blob. Verify:
  - The detail view opens
  - The detail panel shows an argument's full text and its SRT relations
  - Entities inside the blob remain fully opaque; other nodes dim

- [ ] Click the canvas. Verify dimming clears.

- [ ] Uncheck "Show argument blobs". Verify blobs disappear and the simulation reflows without clustering.
