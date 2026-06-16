import { describe, it, expect } from 'vitest'
import { relationGroupOf, edgeStyleVariantFor } from './relations'

describe('relationGroupOf', () => {
  it('maps discovery relations to evidence', () => {
    expect(relationGroupOf('supports')).toBe('evidence')
    expect(relationGroupOf('reveals')).toBe('evidence')
    expect(relationGroupOf('suggests')).toBe('evidence')
  })

  it('folds contradicts into evidence (polarity dropped)', () => {
    expect(relationGroupOf('contradicts')).toBe('evidence')
  })

  it('maps similarity relations to correlation', () => {
    expect(relationGroupOf('correlates_with')).toBe('correlation')
    expect(relationGroupOf('associated_with')).toBe('correlation')
    expect(relationGroupOf('analogous_to')).toBe('correlation')
  })

  it('maps influence relations to causation', () => {
    for (const r of ['causes', 'increases', 'decreases', 'inhibits', 'induces', 'may_cause']) {
      expect(relationGroupOf(r)).toBe('causation')
    }
  })

  it('moves describes / is_defined_as into definition', () => {
    expect(relationGroupOf('describes')).toBe('definition')
    expect(relationGroupOf('is_defined_as')).toBe('definition')
  })

  it('is case-insensitive to the relation type', () => {
    expect(relationGroupOf('SUPPORTS')).toBe('evidence')
    expect(relationGroupOf('Correlates_With')).toBe('correlation')
  })

  it('falls back to evidence for unknown relation types', () => {
    expect(relationGroupOf('frobnicates')).toBe('evidence')
  })
})

describe('edgeStyleVariantFor', () => {
  it('renders correlation as the symmetric association variant', () => {
    expect(edgeStyleVariantFor('correlation')).toBe('association')
  })

  it('renders every other group as directional', () => {
    expect(edgeStyleVariantFor('evidence')).toBe('directional')
    expect(edgeStyleVariantFor('causation')).toBe('directional')
    expect(edgeStyleVariantFor('definition')).toBe('directional')
    expect(edgeStyleVariantFor('concept')).toBe('directional')
  })
})
