import { describe, it, expect } from 'vitest'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

function entity(id: string): GraphNode {
  return { id, type: 'Entity', label: id, confidence: 1 }
}
function edge(id: string, s: string, t: string): GraphEdge {
  return { id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causation' }
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

  it('drops entities with no surviving relations but keeps the argument as node-only', () => {
    const ns = [entity('a'), entity('b'), entity('d'), entity('e'), entity('x')]
    const es = [edge('e1', 'a', 'b'), edge('e3', 'd', 'e')] // x has no edge
    const bs = [blob('arg0', ['a', 'b']), blob('arg2', ['d', 'e'], 'C2'), blob('argX', ['x'])]
    const mm = buildGraphModel(ns, es, bs)
    expect(mm.entities.map(n => n.id).sort()).toEqual(['a', 'b', 'd', 'e']) // x dropped
    expect(mm.entityIds.has('x')).toBe(false)
    expect(mm.argMembers.get('arg0')).toEqual(['a', 'b'])
    expect(mm.argMembers.get('argX')).toEqual([])         // node-only argument
    expect(mm.arguments.map(a => a.id)).toContain('argX')  // still present
  })

  it('keeps an argument whose members partially survive, with only the survivors', () => {
    const ns = [entity('a'), entity('b'), entity('z')]
    const es = [edge('e1', 'a', 'b')] // z has no surviving edge
    const bs = [blob('arg0', ['a', 'b', 'z'])]
    const mm = buildGraphModel(ns, es, bs)
    expect(mm.argMembers.get('arg0')).toEqual(['a', 'b']) // z excluded
    expect(mm.entityIds.has('z')).toBe(false)
  })

  it('groups concepts by label and maps to arguments', () => {
    const c1 = m.argConcept.get('arg0')!
    expect(m.argConcept.get('arg1')).toBe(c1)        // same label C1 -> merged
    expect(m.argConcept.get('arg2')).not.toBe(c1)    // C2 distinct
    expect(m.conceptArgs.get(c1)!.sort()).toEqual(['arg0', 'arg1'])
    expect(m.conceptLabels.get(c1)).toBe('C1')
  })
})
