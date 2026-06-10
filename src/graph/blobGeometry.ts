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
