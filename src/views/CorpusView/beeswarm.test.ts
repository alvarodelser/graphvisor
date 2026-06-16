import { describe, it, expect } from 'vitest'
import { computeBeeswarm } from './beeswarm'

describe('computeBeeswarm', () => {
  const xOf = (year: number) => year - 1990 // simple deterministic x mapping

  it('places each item at its year x and centers a lone item', () => {
    const pos = computeBeeswarm([{ id: 'a', year: 2000 }], { xOf, centerY: 50, radius: 5 })
    expect(pos.get('a')).toEqual({ x: 10, y: 50 })
  })

  it('separates same-year items by at least the diameter on y', () => {
    const pos = computeBeeswarm(
      [{ id: 'a', year: 2000 }, { id: 'b', year: 2000 }, { id: 'c', year: 2000 }],
      { xOf, centerY: 50, radius: 5 },
    )
    const ys = ['a', 'b', 'c'].map(id => pos.get(id)!.y).sort((m, n) => m - n)
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(10)
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(10)
    // all share the same x
    expect(new Set(['a', 'b', 'c'].map(id => pos.get(id)!.x)).size).toBe(1)
  })

  it('is deterministic across runs', () => {
    const items = [{ id: 'a', year: 2000 }, { id: 'b', year: 2000 }, { id: 'c', year: 2001 }]
    const opts = { xOf, centerY: 50, radius: 5 }
    expect(computeBeeswarm(items, opts)).toEqual(computeBeeswarm(items, opts))
  })
})
