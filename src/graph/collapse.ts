import type { GraphEdge, GraphNode } from '../types'
import type { GraphModel } from './graphModel'

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

// An argument collapses to a card when `k · √(entityCount) < collapseK`. The
// decision is driven by ENTITY COUNT — how much the argument holds — not the
// on-screen pixel spread of its blob, so it is predictable regardless of how
// the members happen to be spaced. Bigger arguments (more entities) stay
// expanded to a further zoom-out; small ones collapse first. A low collapseK
// keeps entities visible at normal zoom and only collapses once well zoomed out.
export function computeCollapse(
  model: GraphModel,
  positions: Map<string, { x: number; y: number }>,
  k: number,
  collapseK = 0.6,
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
    if (k * Math.sqrt(pts.length) < collapseK) {
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
