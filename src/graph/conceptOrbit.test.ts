import { describe, it, expect } from 'vitest'
import { ringRadius, computeConceptTargets, stepRingBodies, conceptLinkPath, type RingBody } from './conceptOrbit'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

const entity = (id: string): GraphNode => ({ id, type: 'Entity', label: id, confidence: 1 })
const edge = (id: string, s: string, t: string): GraphEdge =>
  ({ id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causal' })
const blob = (id: string, entityIds: string[], concept: string): ArgumentBlob => ({
  id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: [concept],
})

describe('ringRadius', () => {
  it('encloses the farthest point plus margin', () => {
    const r = ringRadius([{ x: 0, y: 0 }, { x: 300, y: 0 }], { x: 0, y: 0 }, 50)
    expect(r).toBe(350)
  })
})

describe('computeConceptTargets', () => {
  const nodes = [entity('a'), entity('b'), entity('c'), entity('d')]
  const edges = [edge('e1', 'a', 'b')]
  const blobs = [blob('arg0', ['a', 'b'], 'C1'), blob('arg1', ['c', 'd'], 'C2')]
  const model = buildGraphModel(nodes, edges, blobs)

  it('only shows concepts that have a collapsed argument', () => {
    const collapsed = new Set(['arg0'])
    const centroids = new Map([['arg0', { x: 100, y: 0 }]])
    const r = computeConceptTargets(model, collapsed, centroids, { x: 0, y: 0 })
    expect([...r.visibleConceptIds]).toEqual(['concept-C1'])
  })

  it('targets the angle pointing toward the collapsed argument', () => {
    const collapsed = new Set(['arg0'])
    const centroids = new Map([['arg0', { x: 0, y: 100 }]]) // straight up
    const r = computeConceptTargets(model, collapsed, centroids, { x: 0, y: 0 })
    expect(r.targetAngles.get('concept-C1')!).toBeCloseTo(Math.PI / 2)
  })
})

describe('stepRingBodies', () => {
  it('moves a body toward its target angle', () => {
    const bodies = new Map<string, RingBody>([['c', { id: 'c', angle: 0, vAngle: 0 }]])
    const targets = new Map([['c', 1]])
    for (let i = 0; i < 200; i++) stepRingBodies(bodies, targets, new Map())
    expect(bodies.get('c')!.angle).toBeCloseTo(1, 1)
  })

  it('pins a body at a fixed angle', () => {
    const bodies = new Map<string, RingBody>([['c', { id: 'c', angle: 0, vAngle: 0 }]])
    stepRingBodies(bodies, new Map([['c', 1]]), new Map([['c', 2]]))
    expect(bodies.get('c')!.angle).toBe(2)
    expect(bodies.get('c')!.vAngle).toBe(0)
  })
})

describe('conceptLinkPath', () => {
  it('starts at the concept and ends at the argument', () => {
    const d = conceptLinkPath(100, 0, 50, 0, 0, 0)
    expect(d).toMatch(/^M 100 0/)
    expect(d.trim().endsWith('50 0')).toBe(true)
  })

  it('pulls control points toward the graph center', () => {
    // center at origin, concept at x=100 -> first control point should be inside (x<100)
    const d = conceptLinkPath(100, 0, 50, 0, 0, 0)
    const c1x = Number(d.split('C')[1].trim().split(/[ ,]/)[0])
    expect(c1x).toBeLessThan(100)
    expect(c1x).toBeGreaterThan(0)
  })
})
