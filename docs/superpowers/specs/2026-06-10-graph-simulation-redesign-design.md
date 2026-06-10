# Graph Simulation Redesign — Design

**Date:** 2026-06-10
**Status:** Approved for planning
**Scope:** `src/views/GraphView/` and a new `src/graph/` module group. No changes to `DataService`, `useStore`, detail views, or the public hook contract.

## Problem

The current graph simulation (`useGraphD3.ts`, 1184 lines) grew organically and the user wants it rebuilt from the ground up. Concrete goals:

1. Entities should separate as in conventional force-directed graph drawing.
2. Chains (connected components) should be placed by size — the largest chains near the canvas center, smaller ones spread outward.
3. Arguments (which group the entities appearing in their relations) should render as clean **rounded convex cells**, not wobbly organic blobs. Entities reorganize *within their chain* so each argument's cell is compact and separable; chains themselves do not move.
4. On zoom-out, each argument collapses to a single fixed-size node, replacing its entities. Relations from surviving entities to absorbed entities re-point to the argument node.
5. Concepts live on a single outer orbit, appear only once at least one of their arguments has collapsed, are positioned to minimize link length, and connect to arguments via spiral links.

## Data context (current corpus)

- 5 documents, 117 arguments (116 with ≥2 entities), 187 relations, 243 entities, 16 concepts.
- **Entity sharing:** 202 entities (83%) belong to exactly one argument ("solo"); 41 (17%) belong to more than one ("bridge"). Distribution of arguments-per-entity: `{1:202, 2:25, 3:10, 4:3, 5:2, 6:1}`.
- The 17% bridge entities are the connective tissue that links arguments into chains. This makes clean per-argument cells tractable: each argument is mostly a tidy cluster of its own solo entities plus a couple of boundary bridges.

The graph is small, so a richer per-frame layout computation is affordable.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Layout philosophy | **Hybrid (C):** entities are the simulated bodies; per-argument forces arrange and orient their members into compact, separable cells. Chains stay put; only within-chain entity arrangement is optimized. |
| Collapse trigger | **Per-argument, by on-screen size.** An argument collapses when its blob's on-screen extent drops below a threshold (~70px). Larger/wider arguments survive longer. |
| Shared entity on collapse | **Hides as soon as one of its arguments collapses.** (Coherent because only bridge entities are affected, and re-pointing to the collapsed argument node is the desired behavior.) |
| Concept orbit | **One global ring** around the whole graph; concepts slide along it to minimize link length to their collapsed arguments. |
| Blob shape | **Rounded convex hull, light rounding.** 1 entity → circle, 2 → capsule, 3+ → rounded hull. Constant pad + corner radius in graph units. |
| Collapsed node size | **Fixed size in graph units, equal to entity size** — so nodes shrink with zoom-out (not counter-scaled to constant screen size). Applies to argument nodes and concept nodes. |
| Arguments & concepts as bodies | **Soft bodies, not hard-pinned.** Each has its own position+velocity driven by a spring toward its derived target plus mutual repulsion and damping. All are hoverable and draggable; dragging overrides position and soft-anchors on release. |
| Transition animation | **Deferred non-goal.** Start with instant show/hide + opacity fade; add motion tweening later. |

## Architecture

The monolithic hook is split into focused, mostly-pure modules under a new `src/graph/` group, with the hook reduced to an orchestrator.

| Module | Responsibility | Purity |
|---|---|---|
| `src/graph/graphModel.ts` | Derive from `nodes/edges/blobs`: entity adjacency, degree, connected components (chains) + sizes, argument→members, entity→arguments membership, **solo vs bridge** classification, concept→arguments. Returns a `GraphModel` consumed by everything else. | pure |
| `src/graph/forces.ts` | Factories for the hybrid simulation forces (see "Simulation"). Each takes the `GraphModel` + tunables and returns a D3 force function. | pure factories |
| `src/graph/blobGeometry.ts` | Rounded convex-hull path generation (rewrite of existing): circle/capsule/hull by member count; constant graph-unit pad and corner radius. | pure |
| `src/graph/collapse.ts` | LOD resolution: per-argument collapse state from entity positions + zoom; hidden-entity set; `resolveEndpoint` re-pointing function; list of edges to draw after resolution. | pure |
| `src/graph/conceptOrbit.ts` | Global ring radius from graph extent; per-concept optimal angle; along-ring collision spread; spiral link path generator. | pure |
| `src/graph/softBodies.ts` | Generic soft-body integrator (position+velocity, spring-to-target, mutual repulsion, damping, drag override + soft-anchor) used for argument nodes and concept nodes. | pure |
| `src/views/GraphView/useGraphD3.ts` | Orchestrator: builds the model, configures the simulation, manages zoom/tick/drag/hover, and renders SVG layers. Keeps the existing signature and `HoverItem` export. | impure (D3/DOM) |

`blobGeometry.ts` moves from `src/utils/` to `src/graph/`; it is only imported by the hook today, so the move is contained. The hook's public contract (`useGraphD3(svgRef, nodes, edges, opts)` → `{ reheat }`, plus the `HoverItem` type export) is unchanged, so `GraphView.tsx` and `NodeFloatingCard.tsx` need no edits.

## Simulation

### Bodies and chains

- **Entities are the only true simulation bodies.** Forces: charge (repulsion), relation-link springs (strength scaled by confidence), collide.
- **Chains = connected components of the entity-relation graph**, computed once via union-find. Component sizes drive placement: the largest chain is centered on the canvas; remaining chains are placed on concentric rings ordered by size (bigger = closer in).
- **`chainHome` force** pulls each entity toward its chain's assigned center, strength ∝ √(chain size) so large chains hold the center firmly.
- **Inter-chain separation** via charge plus a chain-level repulsion that keeps neighboring chains from bleeding together.

### Argument-arrangement optimizer (core of approach C)

Within a chain (chains do not move), entities reorganize so each argument's cell is compact, round, and separable. Implemented as soft per-tick forces — no hard solve:

- **`argCohesion`** — pulls an argument's **solo** members toward that argument's centroid (compactness).
- **`argFan`** — distributes an argument's solo members at roughly even angles around its centroid, biased into the hemisphere facing *away* from neighboring arguments. Even angular spread makes the convex hull round and clean; the away-from-neighbor bias is the "orientation" that keeps adjacent cells from overlapping.
- **`bridgePull`** — bridge entities are pulled toward the midpoint between the argument centroids they connect, so they sit on the shared boundary instead of distorting either hull.
- **`blobRepulsion`** — non-member entities are pushed out of an argument's padded hull region (rewrite of the existing force).

Because 83% of entities are solo, this converges to clean tiling cells without an explicit rotation solve.

### Blob rendering

Per frame, for each expanded (non-collapsed) argument, draw a rounded convex cell from its visible members' positions:
- 1 member → circle, 2 → capsule, 3+ → padded convex hull with lightly rounded corners.
- Pad and corner radius are constant in graph units, so cells shrink naturally toward the collapse point on zoom-out.
- Blobs are hoverable and draggable; dragging a blob moves its member entities (as today) and soft-anchors them on release.

## Zoom collapse and edge re-pointing

- **Per-argument by on-screen size.** Each frame, compute each argument's blob on-screen extent (graph spread × zoom `k`); if below the threshold (~70px) the argument collapses.
- **Collapsed argument → a soft-body node** whose spring target is its members' centroid, drawn at entity size in graph units (shrinks with zoom-out). Hoverable and draggable; on drag it overrides and soft-anchors.
- **Hidden entities:** when an argument collapses, all its member entities hide. Solo entities only hide with their own argument; a bridge entity hides with the first of its arguments to collapse.
- **`resolveEndpoint(entityId)`** — returns the entity itself if visible, else the collapsed argument node that absorbed it (nearest collapsed argument node if it belonged to several). For each visible edge, both endpoints are resolved; if both resolve to the same argument node the edge is internal and dropped; otherwise it is drawn between the resolved endpoints (e.g. surviving entity → argument node).

## Concepts on the global orbit

- A concept appears only when **≥1 of its arguments has collapsed**.
- **One global ring** in graph units; radius = graph bounding extent + margin.
- Each visible concept is a **soft body constrained to the ring**: its spring target is the angle minimizing total link length to its collapsed arguments (≈ the angle of its arguments' weighted centroid seen from graph center); concepts repel each other along the ring to avoid overlap. Draggable to re-pin its angle.
- Concepts relate **only to arguments**. Links are **spiral** cubic-beziers — tangential offset at the ring end curving inward to the argument node (reusing the existing `conceptEdgePath` idea).
- Concept nodes are diamonds at fixed graph-unit size.

## Rendering layers (SVG, back to front)

1. Rings background
2. Blobs (expanded arguments)
3. Concept spiral links
4. Entity-relation edges (after collapse resolution)
5. Entity nodes
6. Argument nodes (collapsed)
7. Concept nodes

Hover muting/highlight behavior (neighbor emphasis, blob/argument/concept highlight) is preserved from the current implementation.

## Interactivity (preserved + extended)

- Hover on any entity, edge, blob, argument node, or concept node surfaces the floating card (`HoverItem` payloads unchanged; a blob and a collapsed argument node surface the same argument payload).
- Drag entities (as today), blobs (moves members), argument nodes (soft body), concept nodes (re-pin ring angle).
- Click selection, canvas-click clear, filters, and `reheat` behave as today.

## Testing

- **Pure modules** (`graphModel`, `blobGeometry`, `collapse`, `conceptOrbit`, `softBodies`) get unit tests with small fixtures: component detection and sizing, solo/bridge classification, blob path for 1/2/3+ members, collapse threshold math, `resolveEndpoint` re-pointing (including both-endpoints-collapse drop and multi-argument nearest selection), and optimal concept angle.
- **Forces** get lightweight convergence sanity checks (e.g. solo members end within expected radius of their argument centroid after N ticks on a fixture).
- Manual verification in-app via the visual companion / dev server for layout quality, collapse staging, and concept orbit behavior.

## Non-goals

- Animated tweening of collapse/expand transitions (deferred; instant + opacity fade for now).
- Changes to data loading, filtering semantics, detail views, or the discover/corpus views.
- Performance work beyond keeping the small-graph case smooth (the noted prior perf items can be revisited separately).

## Build sequence (high level)

1. `graphModel.ts` + tests.
2. `blobGeometry.ts` rewrite + tests.
3. `softBodies.ts` + tests.
4. `collapse.ts` + tests.
5. `conceptOrbit.ts` + tests.
6. `forces.ts`.
7. `useGraphD3.ts` orchestrator rewrite wiring it together.
8. Manual tuning pass on force constants and thresholds.
