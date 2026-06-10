import { describe, it, expect } from 'vitest'
import { computeCollapse } from './collapse'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

const entity = (id: string): GraphNode => ({ id, type: 'Entity', label: id, confidence: 1 })
const edge = (id: string, s: string, t: string): GraphEdge =>
  ({ id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causal' })
const blob = (id: string, entityIds: string[]): ArgumentBlob => ({
  id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: ['C1'],
})

describe('computeCollapse', () => {
  // arg0 = {a,b} tight (collapses), arg1 = {c,d} far apart (stays expanded)
  const nodes = [entity('a'), entity('b'), entity('c'), entity('d')]
  const edges = [edge('e1', 'b', 'c')] // bridge edge between the two arguments
  const blobs = [blob('arg0', ['a', 'b']), blob('arg1', ['c', 'd'])]
  const model = buildGraphModel(nodes, edges, blobs)
  const positions = new Map([
    ['a', { x: 0, y: 0 }], ['b', { x: 5, y: 0 }],          // 5px apart
    ['c', { x: 500, y: 0 }], ['d', { x: 900, y: 0 }],      // 400px apart
  ])
  const r = computeCollapse(model, positions, 1, 70)

  it('collapses only the small argument', () => {
    expect(r.collapsedArgIds.has('arg0')).toBe(true)
    expect(r.collapsedArgIds.has('arg1')).toBe(false)
  })

  it('hides members of collapsed arguments', () => {
    expect(r.hiddenEntityIds.has('a')).toBe(true)
    expect(r.hiddenEntityIds.has('b')).toBe(true)
    expect(r.hiddenEntityIds.has('c')).toBe(false)
  })

  it('resolves a hidden entity to its collapsed argument node', () => {
    expect(r.resolveEndpoint('b')).toBe('arg0')
    expect(r.resolveEndpoint('c')).toBe('c')   // visible -> itself
  })

  it('re-points an edge from a visible entity to the collapsed arg node', () => {
    const ve = r.visibleEdges.find(v => v.edge.id === 'e1')!
    expect(ve.sourceId).toBe('arg0')           // b -> arg0
    expect(ve.targetId).toBe('c')
  })

  it('drops an edge internal to one collapsed argument', () => {
    const nodes2 = [entity('a'), entity('b')]
    const edges2 = [edge('e1', 'a', 'b')]
    const blobs2 = [blob('arg0', ['a', 'b'])]
    const m2 = buildGraphModel(nodes2, edges2, blobs2)
    const pos2 = new Map([['a', { x: 0, y: 0 }], ['b', { x: 5, y: 0 }]])
    const r2 = computeCollapse(m2, pos2, 1, 70)
    expect(r2.visibleEdges.find(v => v.edge.id === 'e1')).toBeUndefined()
  })

  it('provides a centroid for each collapsed argument', () => {
    const c = r.argCentroids.get('arg0')!
    expect(c.x).toBeCloseTo(2.5)
    expect(c.y).toBeCloseTo(0)
  })
})
