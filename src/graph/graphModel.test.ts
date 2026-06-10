import { describe, it, expect } from 'vitest'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

function entity(id: string): GraphNode {
  return { id, type: 'Entity', label: id, confidence: 1 }
}
function edge(id: string, s: string, t: string): GraphEdge {
  return { id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causal' }
}
function blob(id: string, entityIds: string[], concept = 'C1'): ArgumentBlob {
  return {
    id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
    source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: [concept],
  }
}

describe('buildGraphModel', () => {
  // Two separate chains: (a-b-c) and (d-e)
  const nodes = [entity('a'), entity('b'), entity('c'), entity('d'), entity('e')]
  const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c'), edge('e3', 'd', 'e')]
  const blobs = [blob('arg0', ['a', 'b']), blob('arg1', ['b', 'c']), blob('arg2', ['d', 'e'], 'C2')]
  const m = buildGraphModel(nodes, edges, blobs)

  it('keeps only entity nodes and entity-entity edges', () => {
    expect(m.entities.map(n => n.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(m.edges.map(e => e.id).sort()).toEqual(['e1', 'e2', 'e3'])
  })

  it('computes degree', () => {
    expect(m.degree.get('b')).toBe(2)
    expect(m.degree.get('a')).toBe(1)
  })

  it('detects two chains with correct sizes', () => {
    const chainA = m.chainOf.get('a')!
    const chainD = m.chainOf.get('d')!
    expect(chainA).not.toBe(chainD)
    expect(m.chainSizes.get(chainA)).toBe(3)
    expect(m.chainSizes.get(chainD)).toBe(2)
    expect(m.chainsBySize[0]).toBe(chainA) // largest first
  })

  it('classifies solo vs bridge entities', () => {
    // b is in arg0 and arg1 -> bridge; a, c, d, e -> solo
    expect(m.bridgeEntities.has('b')).toBe(true)
    expect(m.soloEntities.has('a')).toBe(true)
    expect(m.soloEntities.has('b')).toBe(false)
    expect(m.entityArgs.get('b')!.sort()).toEqual(['arg0', 'arg1'])
  })

  it('groups concepts by label and maps to arguments', () => {
    const c1 = m.argConcept.get('arg0')!
    expect(m.argConcept.get('arg1')).toBe(c1)        // same label C1 -> merged
    expect(m.argConcept.get('arg2')).not.toBe(c1)    // C2 distinct
    expect(m.conceptArgs.get(c1)!.sort()).toEqual(['arg0', 'arg1'])
    expect(m.conceptLabels.get(c1)).toBe('C1')
  })
})
