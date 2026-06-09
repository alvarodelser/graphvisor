import { describe, it, expect } from 'vitest'
import { computeBlobPath, computeCapsulePath, makeBlobClusterForce, BLOB_PAD } from '../src/utils/blobGeometry'
import type { ArgumentBlob, GraphNode } from '../src/types'

const blob2: ArgumentBlob = {
  id: 'doc_0_arg_0',
  entityIds: ['entity_a', 'entity_b'],
  full_argument: 'A causes B',
  argument_type: 'causal',
  confidence: 0.9,
  source_document_id: 'doc_0',
  source_document_title: 'Test Doc',
}

const blob3: ArgumentBlob = {
  ...blob2,
  id: 'doc_0_arg_1',
  entityIds: ['entity_a', 'entity_b', 'entity_c'],
}

describe('computeCapsulePath', () => {
  it('returns a non-empty SVG path string', () => {
    const path = computeCapsulePath(0, 0, 100, 0, BLOB_PAD)
    expect(path).toContain('M')
    expect(path).toContain('A')
    expect(path).toContain('Z')
  })
})

describe('computeBlobPath', () => {
  it('returns null when fewer than 2 entity positions are known', () => {
    const positions = new Map([['entity_a', { x: 0, y: 0 }]])
    expect(computeBlobPath(blob2, positions)).toBeNull()
  })

  it('returns a capsule path for exactly 2 entities', () => {
    const positions = new Map([
      ['entity_a', { x: 0, y: 0 }],
      ['entity_b', { x: 100, y: 0 }],
    ])
    const path = computeBlobPath(blob2, positions)
    expect(path).not.toBeNull()
    expect(path).toContain('A') // arc for capsule ends
    expect(path).toContain('Z')
  })

  it('returns a spline path for 3+ entities', () => {
    const positions = new Map([
      ['entity_a', { x: 0, y: 0 }],
      ['entity_b', { x: 100, y: 0 }],
      ['entity_c', { x: 50, y: 100 }],
    ])
    const path = computeBlobPath(blob3, positions)
    expect(path).not.toBeNull()
    expect(path).toContain('C') // cubic bezier from catmull-rom
    expect(path).toContain('Z')
  })
})

describe('makeBlobClusterForce', () => {
  it('pulls blob members toward centroid', () => {
    const nodes: GraphNode[] = [
      { id: 'entity_a', type: 'Entity', label: 'a', confidence: 1, x: 0, y: 0, vx: 0, vy: 0 },
      { id: 'entity_b', type: 'Entity', label: 'b', confidence: 1, x: 100, y: 0, vx: 0, vy: 0 },
    ]
    const force = makeBlobClusterForce([blob2], nodes)
    force(1)
    // entity_a at x=0 should be pulled rightward (toward centroid x=50)
    expect(nodes[0].vx).toBeGreaterThan(0)
    // entity_b at x=100 should be pulled leftward (toward centroid x=50)
    expect(nodes[1].vx).toBeLessThan(0)
  })

  it('skips blobs with fewer than 2 resolved members', () => {
    const nodes: GraphNode[] = [
      { id: 'entity_a', type: 'Entity', label: 'a', confidence: 1, x: 0, y: 0, vx: 0, vy: 0 },
    ]
    const force = makeBlobClusterForce([blob2], nodes)
    force(1)
    expect(nodes[0].vx).toBe(0)
    expect(nodes[0].vy).toBe(0)
  })
})
