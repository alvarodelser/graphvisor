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

// Concept→argument link, bundled through the graph center: both control points
// are pulled toward the center so links from all concepts travel inward together
// before fanning out to their arguments.
//
// To stop the curve folding back on itself (the case where the argument sits
// between its concept and the center, so the pulled control points overshoot
// PAST the argument), each control point's component ALONG the concept→argument
// heading is clamped into a monotonic [0, L] range. The perpendicular component
// — the actual inward bow that creates the bundled look — is kept untouched, so
// ordinary links are unchanged and only the overshooting ones are reined in.
export function conceptLinkPath(
  cx: number, cy: number, ax: number, ay: number,
  gcx: number, gcy: number,
): string {
  const ux = ax - cx, uy = ay - cy
  const L = Math.hypot(ux, uy) || 1
  const nx = ux / L, ny = uy / L          // unit heading: concept → argument
  const pull = 0.6

  // Classic toward-center control points, then split into along/perp and clamp
  // the along-axis progress so it is monotonic and never runs past the argument.
  const fold = (px: number, py: number, loAlong: number): [number, number, number] => {
    const along = (px - cx) * nx + (py - cy) * ny
    const perpx = px - cx - along * nx, perpy = py - cy - along * ny
    const a = Math.max(loAlong, Math.min(L, along))
    return [cx + nx * a + perpx, cy + ny * a + perpy, a]
  }
  const [c1x, c1y, a1] = fold(cx + (gcx - cx) * pull, cy + (gcy - cy) * pull, 0)
  const [c2x, c2y] = fold(ax + (gcx - ax) * pull, ay + (gcy - ay) * pull, a1)
  return `M ${cx} ${cy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ax} ${ay}`
}
