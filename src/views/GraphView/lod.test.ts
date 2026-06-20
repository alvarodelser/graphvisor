import { describe, it, expect } from 'vitest'
import { lodMode } from './lod'

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
