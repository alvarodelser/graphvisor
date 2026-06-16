import { describe, it, expect } from 'vitest'
import { directionalOuterPoints, associationOuterPoints } from './edgeStyles'

// Parse "x,y x,y ..." into [[x,y], ...]
const parse = (s: string) => s.trim().split(/\s+/).map(p => p.split(',').map(Number) as [number, number])

describe('directionalOuterPoints', () => {
  it('is a pentagon from the source (0) to a tip at len', () => {
    const pts = parse(directionalOuterPoints(40))
    expect(pts).toHaveLength(5)
    // single tip on the x-axis at len
    expect(pts).toContainEqual([40, 0])
    // body starts at x=0
    expect(pts[0]).toEqual([0, -6])
  })
})

describe('associationOuterPoints', () => {
  it('is a hexagon centered on the origin with a tip at each end', () => {
    const pts = parse(associationOuterPoints(40))
    expect(pts).toHaveLength(6)
    // symmetric tips on the x-axis at -len/2 and +len/2
    expect(pts).toContainEqual([-20, 0])
    expect(pts).toContainEqual([20, 0])
  })

  it('is horizontally symmetric (centered)', () => {
    const xs = parse(associationOuterPoints(60)).map(([x]) => x)
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs))
  })
})
