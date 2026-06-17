import { describe, it, expect } from 'vitest'
import { buildConceptTree, conceptIdOf } from './conceptTree'
import type { ArgumentBlob } from '../../types'

const blob = (id: string, parent_concepts: string[]): ArgumentBlob => ({
  id, entityIds: [], full_argument: `full ${id}`, argument_type: 'mechanistic', confidence: 0.9,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts,
})

describe('buildConceptTree', () => {
  it('groups arguments under their top-ranked concept', () => {
    const tree = buildConceptTree([
      blob('a1', ['recombination', 'MutS']),
      blob('a2', ['recombination']),
      blob('a3', ['MutS']),
    ])
    const reco = tree.find(c => c.id === conceptIdOf('recombination'))!
    expect(reco.args.map(a => a.id).sort()).toEqual(['a1', 'a2'])
    expect(reco.args.find(a => a.id === 'a1')!.secondaryConceptIds).toEqual([conceptIdOf('MutS')])
  })

  it('orders concepts by argument count descending', () => {
    const tree = buildConceptTree([
      blob('a1', ['recombination']),
      blob('a2', ['recombination']),
      blob('a3', ['MutS']),
    ])
    expect(tree[0].id).toBe(conceptIdOf('recombination'))
  })
})
