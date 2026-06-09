# Argument Blobs — Design Spec
_Date: 2026-06-09_

## Overview

Arguments are passages of text that assert one or more entity-relationship-entity triplets. The graph currently shows only entity nodes and relation edges; arguments are invisible. This feature makes arguments visible as **convex-hull blobs** that enclose the entities they connect, without adding argument nodes to the graph. Blobs are a toggle — off by default, off means the graph is unchanged.

---

## Data Layer

### New type: `ArgumentBlob`

```ts
interface ArgumentBlob {
  id: string             // e.g. "doc_0_arg_3"
  entityIds: string[]    // entity node IDs from this argument's relations
  full_argument: string
  argument_type: string  // "mechanistic" | "causal" | "evidence" | ...
  confidence: number
  source_document_id: string
  source_document_title: string
}
```

### `DataServiceInterface` changes

`getGraph()` return type extends to `{ nodes, edges, blobs }`:

```ts
getGraph(documentIds: string[]): Promise<{
  nodes: GraphNode[]
  edges: GraphEdge[]
  blobs: ArgumentBlob[]
}>
```

`RealDataService.getGraph()` builds blobs by iterating raw arguments, collecting the unique entity IDs from each argument's relations, and applying the same document filter already used for nodes/edges.

### `getArgumentDetail()` extended

Currently accepts entity node IDs. Extended to also accept argument IDs (matching `doc_\d+_arg_\d+`). When called with an argument ID, returns:

- `argument`: a synthetic `GraphNode` shaped from the `ArgumentBlob` (`type: 'Argument'`, `full_text: full_argument`, `confidence`)
- `relations`: the SRT triples from that argument, each as an `ArgumentRelation` with `target_argument_id` pointing to the object entity's node ID
- `sources`: the source `DocNode`

---

## State

### `useStore`

Two additions:

```ts
showBlobs: boolean           // default: false
selectedArgumentId: string | null  // default: null
setShowBlobs: (v: boolean) => void
setSelectedArgumentId: (id: string | null) => void
```

`selectedArgumentId` is set on blob click and cleared on canvas click or blob deselect. It is independent of `selectedNodeId`.

---

## Graph Rendering (`useGraphD3`)

### SVG layer order (bottom → top)

```
ringG     — dashed background rings (existing)
blobG     — argument blobs (NEW, below edges so nodes/edges stay interactive)
edgeG     — chevron edges (existing)
nodeG     — entity circles (existing)
```

`blobG` is created once between `ringG` and `edgeG` in the main `useEffect`.

### Blob shapes

Each blob is a `<path>` element in `blobG`. Shape logic per argument:

| Entity count | Shape |
|---|---|
| 0–1 | Skip (no path rendered) |
| 2 | Rounded capsule: midpoint + perpendicular offset, closed path with rounded ends |
| 3+ | `d3.polygonHull(points)` → expand each vertex outward by `BLOB_PAD = 24px` → catmull-rom closed spline |

Hull expansion: for each hull vertex, compute the unit vector from centroid to vertex and offset by `BLOB_PAD`. This prevents nodes sitting exactly on the hull boundary.

Visual style (fixed, not configurable):

```
fill:           rgba(100, 116, 139, 0.08)
stroke:         rgba(100, 116, 139, 0.35)
stroke-width:   1.5
stroke-dasharray: 4 3
cursor:         pointer
```

On hover: stroke opacity increases to 0.65, fill to 0.14.

On selection (blob click): stroke becomes `rgba(100,116,139,0.7)`, fill `rgba(100,116,139,0.16)`.

### Tick handler

The existing `sim.on('tick', ...)` is extended to also update blob paths. After updating node transforms, for each visible blob in `blobG`:

```
get current (x, y) for each entityId from simNodes
compute hull / capsule
update <path d="...">
```

This runs every tick, so blobs follow nodes as the simulation moves.

### Pointer events

`blobG` paths: `pointer-events: fill` (clicks land on filled area).  
Since `nodeG` and `edgeG` are on top in SVG z-order, node and edge clicks take priority naturally. Blob clicks only fire when clicking within the blob area that doesn't overlap a node or edge.

### `Options` interface additions

```ts
interface Options {
  // existing...
  blobs: ArgumentBlob[]
  showBlobs: boolean
  selectedArgumentId: string | null
  onBlobClick: (blob: ArgumentBlob) => void
}
```

---

## Force: Blob Clustering

A **custom named D3 force** (`'blobCluster'`) is added to the simulation when `showBlobs` is `true`, removed when `false`.

```ts
function makeBlobClusterForce(blobs: ArgumentBlob[], simNodes: GraphNode[], strength = 0.08) {
  return function(alpha: number) {
    for (const blob of blobs) {
      const members = blob.entityIds
        .map(id => simNodes.find(n => n.id === id))
        .filter(Boolean) as GraphNode[]
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

### Toggle lifecycle (secondary `useEffect`)

Dependency array: `[showBlobs, blobs]`. Does NOT rebuild the simulation.

```
const sim = simRef.current
if (!sim) return   // guard: simulation not yet initialised

if showBlobs:
  sim.force('blobCluster', makeBlobClusterForce(blobs, simNodes))
  blobG.style('display', null)
  sim.alpha(0.3).restart()
else:
  sim.force('blobCluster', null)
  blobG.style('display', 'none')
  sim.alpha(0.15).restart()
```

`simNodes` is the same array D3 mutates for positions (stored in a `useRef` so it is stable across effects). The force closure captures it by reference, so it always reads the latest positions.

---

## Interaction

### Blob click

```
onBlobClick(blob):
  setSelectedArgumentId(blob.id)
  setActiveView('detail')          // opens detail panel
  // highlight: dim all nodes/edges except blob.entityIds and edges between them
```

Highlight logic mirrors existing node hover mute: `nodeGroups.attr('opacity', ...)` and `edgeGroups.attr('opacity', ...)` driven by whether the node/edge is in the blob's entity set.

### Canvas click

Clears both `selectedNodeId` and `selectedArgumentId`. Restores all opacities.

### Detail view

`DetailView` currently calls `dataService.getArgumentDetail(selectedNodeId)`. With this change it checks `selectedArgumentId` first:

```ts
const id = selectedArgumentId ?? selectedNodeId
dataService.getArgumentDetail(id).then(setDetail)
```

The detail view renders the same way — it already works with `GraphNode` shaped objects regardless of whether they're real graph nodes or synthetic argument nodes.

---

## Control Panel

A new toggle in the GraphView filter panel:

```
□ Show argument blobs
```

Default: unchecked. Wired to `showBlobs` in store.

---

## Scope

**In scope:**
- `ArgumentBlob` type in `src/types/index.ts`
- `DataService` interface + `RealDataService` implementation changes
- `useStore` additions (`showBlobs`, `selectedArgumentId`)
- `useGraphD3` blob layer, tick update, pointer events, options additions
- Secondary toggle effect with clustering force
- `GraphView` control panel toggle
- `DetailView` argument ID support

**Out of scope:**
- Blob labels / annotation overlays
- Per-document or per-type blob colouring (neutral only)
- Blob filtering beyond the existing document filter
- Animation of blob appear/disappear transition
