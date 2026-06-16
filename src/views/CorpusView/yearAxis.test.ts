import { describe, it, expect } from 'vitest'
import { makeYearScale } from './yearAxis'

describe('makeYearScale', () => {
  it('maps min year to left and max year to right', () => {
    const s = makeYearScale([1991, 2003, 2020], 30, 270)
    expect(s.domain).toEqual([1991, 2020])
    expect(s.scale(1991)).toBeCloseTo(30)
    expect(s.scale(2020)).toBeCloseTo(270)
    expect(s.scale(2005.5)).toBeCloseTo(150) // midpoint
  })
  it('handles a single year by centering it', () => {
    const s = makeYearScale([2000], 30, 270)
    expect(s.domain).toEqual([2000, 2000])
    expect(s.scale(2000)).toBeCloseTo(150)
  })
})
