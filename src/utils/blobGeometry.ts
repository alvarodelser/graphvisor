import { polygonHull } from 'd3-polygon'
import type { ArgumentBlob } from '../types'
import type { GraphNode } from '../types'

export const BLOB_PAD = 24

// Catmull-rom closed spline through points
function catmullRomClosed(pts: [number, number][]): string {
  if (pts.length < 2) return ''
  const n = pts.length
  const alpha = 0.5
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const t01 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), alpha)
    const t12 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), alpha)
    const t23 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), alpha)
    const m1x = t12 === 0 ? 0 : (p2[0] - p0[0] + t12 * ((p1[0] - p0[0]) / t01 - (p2[0] - p0[0]) / (t01 + t12))) || 0
    const m1y = t12 === 0 ? 0 : (p2[1] - p0[1] + t12 * ((p1[1] - p0[1]) / t01 - (p2[1] - p0[1]) / (t01 + t12))) || 0
    const m2x = t12 === 0 ? 0 : (p2[0] - p1[0] + t12 * ((p3[0] - p1[0]) / (t12 + t23) - (p2[0] - p1[0]) / t12)) || 0
    const m2y = t12 === 0 ? 0 : (p2[1] - p1[1] + t12 * ((p3[1] - p1[1]) / (t12 + t23) - (p2[1] - p1[1]) / t12)) || 0
    const bp1x = p1[0] + m1x / 3
    const bp1y = p1[1] + m1y / 3
    const bp2x = p2[0] - m2x / 3
    const bp2y = p2[1] - m2y / 3
    d += ` C ${bp1x},${bp1y} ${bp2x},${bp2y} ${p2[0]},${p2[1]}`
  }
  return d + ' Z'
}

// Expand hull vertices outward from centroid by BLOB_PAD
function expandHull(hull: [number, number][], pad: number): [number, number][] {
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length
  return hull.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const len = Math.hypot(dx, dy) || 1
    return [x + (dx / len) * pad, y + (dy / len) * pad]
  })
}

// Capsule path for exactly 2 points
export function computeCapsulePath(
  ax: number, ay: number,
  bx: number, by: number,
  pad: number
): string {
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * pad
  const ny = (dx / len) * pad
  return [
    `M ${ax + nx},${ay + ny}`,
    `L ${bx + nx},${by + ny}`,
    `A ${pad},${pad} 0 0 1 ${bx - nx},${by - ny}`,
    `L ${ax - nx},${ay - ny}`,
    `A ${pad},${pad} 0 0 1 ${ax + nx},${ay + ny}`,
    'Z',
  ].join(' ')
}

// Compute the SVG path for a blob given current node positions
export function computeBlobPath(
  blob: ArgumentBlob,
  nodePositions: Map<string, { x: number; y: number }>
): string | null {
  const pts: [number, number][] = blob.entityIds
    .map(id => nodePositions.get(id))
    .filter((p): p is { x: number; y: number } => p !== undefined)
    .map(p => [p.x, p.y])

  if (pts.length < 2) return null

  if (pts.length === 2) {
    return computeCapsulePath(pts[0][0], pts[0][1], pts[1][0], pts[1][1], BLOB_PAD)
  }

  const hull = polygonHull(pts)
  if (!hull) return null

  const expanded = expandHull(hull, BLOB_PAD)
  return catmullRomClosed(expanded)
}

// D3 custom force that pushes non-member nodes away from each blob member's exclusion zone
export function makeBlobRepulsionForce(
  blobs: ArgumentBlob[],
  simNodes: GraphNode[],
  strength = 0.12
) {
  const blobInfos = blobs.map(b => ({
    memberSet: new Set(b.entityIds),
    memberNodes: b.entityIds
      .map(id => simNodes.find(n => n.id === id))
      .filter((n): n is GraphNode => n !== undefined),
  }))

  return function (alpha: number) {
    const R = BLOB_PAD + 10
    for (const { memberSet, memberNodes } of blobInfos) {
      for (const member of memberNodes) {
        const mx = member.x ?? 0
        const my = member.y ?? 0
        for (const n of simNodes) {
          if (memberSet.has(n.id)) continue
          const dx = (n.x ?? 0) - mx
          const dy = (n.y ?? 0) - my
          if (Math.abs(dx) > R || Math.abs(dy) > R) continue
          const dist = Math.hypot(dx, dy) || 1
          if (dist < R) {
            const f = (R - dist) / dist * strength * alpha
            n.vx = (n.vx ?? 0) + dx * f
            n.vy = (n.vy ?? 0) + dy * f
          }
        }
      }
    }
  }
}

// D3 custom force that gently pulls blob members toward each other's centroid
export function makeBlobClusterForce(
  blobs: ArgumentBlob[],
  simNodes: GraphNode[],
  strength = 0.08
) {
  return function (alpha: number) {
    for (const blob of blobs) {
      const members = blob.entityIds
        .map(id => simNodes.find(n => n.id === id))
        .filter((n): n is GraphNode => n !== undefined)
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
