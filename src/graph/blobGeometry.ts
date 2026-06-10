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
  // sweep-flag 0 so the end-caps bulge OUTWARD (convex pill). With sweep-flag 1
  // the caps arc back toward the middle, pinching the capsule into an hourglass.
  return [
    `M ${ax + nx},${ay + ny}`,
    `L ${bx + nx},${by + ny}`,
    `A ${pad},${pad} 0 0 0 ${bx - nx},${by - ny}`,
    `L ${ax - nx},${ay - ny}`,
    `A ${pad},${pad} 0 0 0 ${ax + nx},${ay + ny}`,
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

// Perpendicular distance from point p to the infinite line through a and b.
function perpDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
}

// The two points that are farthest apart (the principal axis of the cluster).
function farthestPair(pts: Pt[]): [Pt, Pt] {
  let a = pts[0], b = pts[0], best = -1
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const dd = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
      if (dd > best) { best = dd; a = pts[i]; b = pts[j] }
    }
  return [a, b]
}

// Minimum width of a convex polygon (smallest distance across any edge direction).
function minWidth(hull: Pt[]): number {
  let min = Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    let maxd = 0
    for (const p of hull) maxd = Math.max(maxd, perpDistance(p, a, b))
    min = Math.min(min, maxd)
  }
  return min
}

// Capsule along the principal axis, fattened so it encloses every point with
// `pad` of margin. Used for clusters too thin to render as a hull without
// collapsing to a line.
function enclosingCapsule(points: Pt[], pad: number): string {
  const [a, b] = farthestPair(points)
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) return circlePath(a[0], a[1], pad)
  const perp = Math.max(0, ...points.map(p => perpDistance(p, a, b)))
  return capsulePath(a[0], a[1], b[0], b[1], pad + perp)
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
  // Collinear, or a sliver thinner than the padding: a rounded hull would look
  // like a line, so render an enclosing capsule with guaranteed thickness.
  if (!hull || minWidth(hull as Pt[]) < pad) return enclosingCapsule(points, pad)
  return roundedHullPath(expand(hull as Pt[], pad), corner)
}
