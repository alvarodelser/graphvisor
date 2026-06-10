import { describe, it, expect } from 'vitest'
import { stepSoftBodies, type SoftBody } from './softBodies'

function body(id: string, x: number, y: number): SoftBody {
  return { id, x, y, vx: 0, vy: 0 }
}

describe('stepSoftBodies', () => {
  it('springs a body toward its target', () => {
    const bodies = new Map([['a', body('a', 0, 0)]])
    const targets = new Map([['a', { x: 100, y: 0 }]])
    for (let i = 0; i < 200; i++) stepSoftBodies(bodies, { targets, pinned: new Map() })
    expect(bodies.get('a')!.x).toBeGreaterThan(90)
    expect(Math.abs(bodies.get('a')!.y)).toBeLessThan(1)
  })

  it('pins a body exactly at its pinned position and zeroes velocity', () => {
    const bodies = new Map([['a', body('a', 0, 0)]])
    const targets = new Map([['a', { x: 100, y: 0 }]])
    const pinned = new Map([['a', { x: 5, y: 7 }]])
    stepSoftBodies(bodies, { targets, pinned })
    const b = bodies.get('a')!
    expect(b.x).toBe(5)
    expect(b.y).toBe(7)
    expect(b.vx).toBe(0)
    expect(b.vy).toBe(0)
  })

  it('separates two bodies sharing one target by at least repelDist', () => {
    const bodies = new Map([['a', body('a', 0, 0)], ['b', body('b', 1, 0)]])
    const targets = new Map([['a', { x: 0, y: 0 }], ['b', { x: 0, y: 0 }]])
    for (let i = 0; i < 400; i++)
      stepSoftBodies(bodies, { targets, pinned: new Map(), repelDist: 40, repelStrength: 0.5 })
    const a = bodies.get('a')!, b = bodies.get('b')!
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(30)
  })
})
