import { describe, it, expect } from 'vitest'
import { isPointInPolygon, computeRadialTiers } from '../src/utils/geometry'

const square: [number, number][] = [[0,0],[100,0],[100,100],[0,100]]

describe('isPointInPolygon', () => {
  it('returns true for a point inside', () => {
    expect(isPointInPolygon([50, 50], square)).toBe(true)
  })
  it('returns false for a point outside', () => {
    expect(isPointInPolygon([150, 50], square)).toBe(false)
  })
  it('returns false for a point above', () => {
    expect(isPointInPolygon([50, 150], square)).toBe(false)
  })
})

describe('computeRadialTiers', () => {
  const nodes = [
    { id: 'a1', type: 'Argument' },
    { id: 'a2', type: 'Argument' },
    { id: 'a3', type: 'Argument' },
    { id: 'a4', type: 'Argument' },
    { id: 'e1', type: 'Entity' },
  ]
  const edges = [
    { source: 'a1', target: 'a2' },
    { source: 'a1', target: 'a3' },
    { source: 'a1', target: 'a4' },
    { source: 'a2', target: 'a3' },
  ]

  it('assigns tier 0 to highest-degree argument', () => {
    const tiers = computeRadialTiers(nodes, edges)
    expect(tiers.get('a1')).toBe(0)
  })
  it('does not include Entity nodes', () => {
    const tiers = computeRadialTiers(nodes, edges)
    expect(tiers.has('e1')).toBe(false)
  })
  it('assigns higher tier to lowest-degree argument', () => {
    const tiers = computeRadialTiers(nodes, edges)
    expect(tiers.get('a1')!).toBeLessThan(tiers.get('a4')!)
  })
})
