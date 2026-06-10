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
