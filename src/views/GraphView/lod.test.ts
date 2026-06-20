import { describe, it, expect } from 'vitest'
import { lodMode, meterFill } from './lod'

describe('lodMode', () => {
  it('is full below 120', () => {
    expect(lodMode(0)).toBe('full')
    expect(lodMode(119)).toBe('full')
  })

  it('is calm from 120 to 209', () => {
    expect(lodMode(120)).toBe('calm')
    expect(lodMode(209)).toBe('calm')
  })

  it('is lean from 210 to 299', () => {
    expect(lodMode(210)).toBe('lean')
    expect(lodMode(299)).toBe('lean')
  })

  it('is blocked at 300 and above', () => {
    expect(lodMode(300)).toBe('blocked')
    expect(lodMode(5000)).toBe('blocked')
  })
})

describe('meterFill', () => {
  it('is empty and ok at zero', () => {
    expect(meterFill(0, 300, 5)).toEqual({ filled: 0, level: 'ok' })
  })

  it('fills proportionally below the warn band', () => {
    expect(meterFill(120, 300, 5).filled).toBe(2) // ceil(0.4*5)
    expect(meterFill(120, 300, 5).level).toBe('ok')
  })

  it('is warn from 60% up to the limit', () => {
    expect(meterFill(180, 300, 5).level).toBe('warn') // 0.6
    expect(meterFill(299, 300, 5).level).toBe('warn')
  })

  it('is over and fully filled at or above the limit', () => {
    expect(meterFill(300, 300, 5)).toEqual({ filled: 5, level: 'over' })
    expect(meterFill(900, 300, 5)).toEqual({ filled: 5, level: 'over' })
  })
})
