import { describe, it, expect } from 'vitest'
import { lodMode, meterFill } from './lod'

describe('lodMode', () => {
  it('is full below 400', () => {
    expect(lodMode(0)).toBe('full')
    expect(lodMode(399)).toBe('full')
  })

  it('is calm from 400 to 799', () => {
    expect(lodMode(400)).toBe('calm')
    expect(lodMode(799)).toBe('calm')
  })

  it('is lean from 800 to 1199', () => {
    expect(lodMode(800)).toBe('lean')
    expect(lodMode(1199)).toBe('lean')
  })

  it('is blocked at 1200 and above', () => {
    expect(lodMode(1200)).toBe('blocked')
    expect(lodMode(9000)).toBe('blocked')
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
