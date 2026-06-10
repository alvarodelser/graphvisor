import { describe, it, expect } from 'vitest'
import { computeBlobPath, roundedHullPath, BLOB_PAD, BLOB_CORNER } from './blobGeometry'

describe('computeBlobPath', () => {
  it('returns null for empty input', () => {
    expect(computeBlobPath([])).toBeNull()
  })

  it('renders a circle for a single point', () => {
    const d = computeBlobPath([[0, 0]])!
    expect(d).toMatch(/^M/)
    expect(d).toContain('A')        // arc commands for the circle
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('renders a capsule for two points', () => {
    const d = computeBlobPath([[0, 0], [100, 0]])!
    expect(d).toMatch(/^M/)
    expect(d).toContain('A')        // two end caps
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('capsule caps bulge outward (convex), not inward (pinched)', () => {
    // sweep-flag must be 0 so the end-caps arc away from the body; sweep-flag 1
    // pinches the capsule into a concave hourglass.
    const d = computeBlobPath([[0, 0], [0, 100]])!
    expect(d).toMatch(/A [\d.]+,[\d.]+ 0 0 0 /)
    expect(d).not.toMatch(/A [\d.]+,[\d.]+ 0 0 1 /)
  })

  it('renders a closed rounded hull for three or more points', () => {
    const d = computeBlobPath([[0, 0], [100, 0], [50, 100]])!
    expect(d).toMatch(/^M/)
    expect(d).toContain('Q')        // rounded corners use quadratic curves
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('exposes constants', () => {
    expect(BLOB_PAD).toBeGreaterThan(0)
    expect(BLOB_CORNER).toBeGreaterThan(0)
  })
})

describe('roundedHullPath', () => {
  it('keeps every output coordinate finite', () => {
    const d = roundedHullPath([[0, 0], [100, 0], [100, 100], [0, 100]], 10)
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    expect(nums.every(Number.isFinite)).toBe(true)
  })
})
