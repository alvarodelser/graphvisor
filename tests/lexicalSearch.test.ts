import { describe, it, expect } from 'vitest'
import { lexicalScore, lexicalSearch } from '../src/utils/lexicalSearch'

describe('lexicalSearch', () => {
  const titles = ['Autophagy flux protects neurons', 'Neuronal autophagy in aging', 'Mitochondrial dynamics', 'Rôle de l’autophagie']

  it('needs every query word, as a word start, ignoring case and accents', () => {
    expect(lexicalScore('autoph neuro', titles[0])).toBeGreaterThan(0)
    expect(lexicalScore('autophagy mito', titles[0])).toBe(0)
    expect(lexicalScore('role', titles[3])).toBeGreaterThan(0)
    expect(lexicalScore('phagy', titles[0])).toBe(0)
  })

  it('ranks whole-phrase and leading matches first', () => {
    expect(lexicalSearch('autophagy', titles, t => t)).toEqual([titles[0], titles[1]])
    expect(lexicalSearch('neuronal autophagy', titles, t => t)[0]).toBe(titles[1])
  })

  it('returns nothing for an empty query', () => {
    expect(lexicalSearch('  ', titles, t => t)).toEqual([])
  })
})
