import { describe, it, expect } from 'vitest'
import { computeChainCenters, chainHomeForce, argLayoutForce, argLayoutForceLinear, bridgePullForce, blobRepulsionForce, blobRepulsionForceGrid } from './forces'
import { buildGraphModel } from './graphModel'
import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

const entity = (id: string, x = 0, y = 0): GraphNode =>
  ({ id, type: 'Entity', label: id, confidence: 1, x, y, vx: 0, vy: 0 })
const edge = (id: string, s: string, t: string): GraphEdge =>
  ({ id, source: s, target: t, relation_type: 'CAUSES', confidence: 0.8, group: 'causation' })
const blob = (id: string, entityIds: string[]): ArgumentBlob => ({
  id, entityIds, full_argument: 'x', argument_type: 'mechanistic', confidence: 0.9,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: ['C1'],
})

describe('computeChainCenters', () => {
  it('puts the largest chain at canvas center', () => {
    const nodes = [entity('a'), entity('b'), entity('c'), entity('d')]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')] // chain {a,b,c} size 3, {d} size 1
    const model = buildGraphModel(nodes, edges, [])
    const centers = computeChainCenters(model, 1000, 800)
    const big = model.chainsBySize[0]
    expect(centers.get(big)!).toEqual({ x: 500, y: 400 })
  })
})

describe('chainHomeForce', () => {
  it('pulls an off-center entity toward its chain center', () => {
    const nodes = [entity('a', 900, 700), entity('b', 905, 700)]
    const edges = [edge('e1', 'a', 'b')]
    const model = buildGraphModel(nodes, edges, [])
    const centers = computeChainCenters(model, 1000, 800) // single chain -> center (500,400)
    const force = chainHomeForce(model, centers, nodes)
    force(1)
    expect(nodes[0].vx!).toBeLessThan(0) // pulled left toward x=500
    expect(nodes[0].vy!).toBeLessThan(0) // pulled up toward y=400
  })
})

describe('argLayoutForce', () => {
  it('pulls scattered solo members toward their argument centroid region', () => {
    const nodes = [entity('a', -300, 0), entity('b', 300, 0), entity('c', 0, 5)]
    const edges = [edge('e1', 'a', 'c'), edge('e2', 'b', 'c')]
    const model = buildGraphModel(nodes, edges, [blob('arg0', ['a', 'b', 'c'])])
    const force = argLayoutForce(model, nodes)
    force(1)
    // 'a' is far left of the centroid (~0,1.7); the force should nudge it rightward (inward)
    expect(nodes[0].vx!).toBeGreaterThan(0)
  })
})

describe('bridgePullForce', () => {
  it('pulls a bridge entity toward the midpoint of its two arguments', () => {
    // bridge 'b' between arg0 (a,b near x=0) and arg1 (b,c near x=200)
    const nodes = [entity('a', 0, 0), entity('b', 0, 0), entity('c', 200, 0)]
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')]
    const model = buildGraphModel(nodes, edges, [blob('arg0', ['a', 'b']), blob('arg1', ['b', 'c'])])
    const force = bridgePullForce(model, nodes)
    force(1)
    expect(nodes[1].vx!).toBeGreaterThan(0) // 'b' pulled right toward arg1
  })
})

describe('blobRepulsionForce', () => {
  it('pushes a non-member entity out of an argument members area', () => {
    const nodes = [entity('a', 0, 0), entity('b', 10, 0), entity('x', 5, 1)] // x sits inside arg0
    const edges = [edge('e1', 'a', 'b')]
    const model = buildGraphModel(nodes, edges, [blob('arg0', ['a', 'b'])])
    const force = blobRepulsionForce(model, nodes)
    force(1)
    expect(Math.hypot(nodes[2].vx!, nodes[2].vy!)).toBeGreaterThan(0) // x gets pushed
  })
})

// A spread-out scene with several arguments; grid pruning only skips pairs beyond
// the interaction radius (which contribute zero), so the result must match naive.
function repulsionScene() {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const blobs: ArgumentBlob[] = []
  for (let g = 0; g < 6; g++) {
    const ids: string[] = []
    for (let k = 0; k < 4; k++) {
      const id = `n${g}_${k}`
      nodes.push(entity(id, g * 40 + k * 3, (k % 2) * 5 + g * 2))
      ids.push(id)
    }
    edges.push(edge(`e${g}`, ids[0], ids[1]))
    blobs.push(blob(`arg${g}`, ids))
  }
  return { model: buildGraphModel(nodes, edges, blobs), nodes }
}

describe('blobRepulsionForceGrid', () => {
  it('matches the naive blobRepulsionForce velocities', () => {
    const a = repulsionScene(), b = repulsionScene()
    blobRepulsionForce(a.model, a.nodes)(1)
    blobRepulsionForceGrid(b.model, b.nodes)(1)
    a.nodes.forEach((n, i) => {
      expect(b.nodes[i].vx!).toBeCloseTo(n.vx!, 6)
      expect(b.nodes[i].vy!).toBeCloseTo(n.vy!, 6)
    })
  })
})

describe('argLayoutForceLinear', () => {
  it('pulls scattered solo members toward their argument centroid region', () => {
    const nodes = [entity('a', -300, 0), entity('b', 300, 0), entity('c', 0, 5)]
    const edges = [edge('e1', 'a', 'c'), edge('e2', 'b', 'c')]
    const model = buildGraphModel(nodes, edges, [blob('arg0', ['a', 'b', 'c'])])
    argLayoutForceLinear(model, nodes)(1)
    expect(nodes[0].vx!).toBeGreaterThan(0) // 'a' nudged inward (rightward)
  })
})
