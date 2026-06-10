export interface SoftBody { id: string; x: number; y: number; vx: number; vy: number }

export interface StepOptions {
  targets: Map<string, { x: number; y: number }>   // spring target per body
  pinned: Map<string, { x: number; y: number }>    // hard override (drag / anchor)
  spring?: number       // pull toward target
  repelDist?: number    // min separation distance
  repelStrength?: number
  damping?: number
}

export function stepSoftBodies(bodies: Map<string, SoftBody>, opts: StepOptions): void {
  const spring = opts.spring ?? 0.15
  const repelDist = opts.repelDist ?? 0
  const repelStrength = opts.repelStrength ?? 0.5
  const damping = opts.damping ?? 0.72

  // Pinned bodies snap and stop
  for (const [id, p] of opts.pinned) {
    const b = bodies.get(id)
    if (b) { b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0 }
  }

  // Spring toward target (skip pinned)
  for (const b of bodies.values()) {
    if (opts.pinned.has(b.id)) continue
    const t = opts.targets.get(b.id)
    if (!t) continue
    b.vx += (t.x - b.x) * spring
    b.vy += (t.y - b.y) * spring
  }

  // Mutual repulsion
  if (repelDist > 0) {
    const arr = [...bodies.values()]
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], c = arr[j]
        const dx = c.x - a.x, dy = c.y - a.y
        const dist = Math.hypot(dx, dy) || 0.01
        if (dist < repelDist) {
          const f = (repelStrength * (repelDist - dist)) / dist
          if (!opts.pinned.has(a.id)) { a.vx -= dx * f; a.vy -= dy * f }
          if (!opts.pinned.has(c.id)) { c.vx += dx * f; c.vy += dy * f }
        }
      }
    }
  }

  // Integrate + damp (skip pinned)
  for (const b of bodies.values()) {
    if (opts.pinned.has(b.id)) continue
    b.vx *= damping; b.vy *= damping
    b.x += b.vx; b.y += b.vy
  }
}
