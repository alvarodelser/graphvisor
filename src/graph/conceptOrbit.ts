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
