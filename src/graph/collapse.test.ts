import { describe, it, expect } from 'vitest'
import { computeCollapse } from './collapse'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

const entity = (id: string): GraphNode => ({ id, type: 'Entity', label: id, confidence: 1 })
const edge = (id: string, s: string, t: string): GraphEdge =>
  ({ id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causation' })
const blob = (id: string, entityIds: string[]): ArgumentBlob => ({
  id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: ['C1'],
})

describe('computeCollapse', () => {
  // Collapse is decided by ENTITY COUNT, not spatial spread:
  // arg0 = {a,b} (2 entities → collapses first), arg1 = {c,d,e,f} (4 entities →
  // stays expanded longer). Every entity needs a surviving edge or the model
  // drops it; e1 (b–c) is the bridge linking the two arguments.
  const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map(entity)
  const edges = [
    edge('e0', 'a', 'b'), edge('e1', 'b', 'c'),
    edge('e2', 'c', 'd'), edge('e3', 'd', 'e'), edge('e4', 'e', 'f'),
  ]
  const blobs = [blob('arg0', ['a', 'b']), blob('arg1', ['c', 'd', 'e', 'f'])]
  const model = buildGraphModel(nodes, edges, blobs)
  const positions = new Map([
    ['a', { x: 0, y: 0 }], ['b', { x: 5, y: 0 }],
    ['c', { x: 500, y: 0 }], ['d', { x: 600, y: 0 }],
    ['e', { x: 700, y: 0 }], ['f', { x: 800, y: 0 }],
  ])
  // collapseK = 1.7: arg0 (√2 ≈ 1.41 < 1.7) collapses; arg1 (√4 = 2.0 ≥ 1.7) stays
  const r = computeCollapse(model, positions, 1, 1.7)

  it('collapses the smaller-count argument but not the larger', () => {
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
    const r2 = computeCollapse(m2, pos2, 1, 1.7)   // √2 < 1.7 ⇒ arg0 collapses
    expect(r2.visibleEdges.find(v => v.edge.id === 'e1')).toBeUndefined()
  })

  it('provides a centroid for each collapsed argument', () => {
    const c = r.argCentroids.get('arg0')!
    expect(c.x).toBeCloseTo(2.5)
    expect(c.y).toBeCloseTo(0)
  })
})
