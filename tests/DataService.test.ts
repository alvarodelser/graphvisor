import { describe, it, expect } from 'vitest'
import { MockDataService } from '../src/data/DataService'

const svc = new MockDataService()

describe('MockDataService', () => {
  it('getDocuments returns non-empty array with required fields', async () => {
    const docs = await svc.getDocuments()
    expect(docs.length).toBeGreaterThan(0)
    expect(docs[0]).toHaveProperty('id')
    expect(docs[0]).toHaveProperty('umap_x')
    expect(docs[0]).toHaveProperty('top_terms')
  })

  it('getGraph returns nodes and edges', async () => {
    const { nodes, edges } = await svc.getGraph(['doc_001'])
    expect(nodes.length).toBeGreaterThan(0)
    expect(edges.length).toBeGreaterThan(0)
    expect(nodes[0]).toHaveProperty('type')
    expect(edges[0]).toHaveProperty('group')
  })

  it('getArgumentDetail returns argument with relations array', async () => {
    const detail = await svc.getArgumentDetail('arg_001')
    expect(detail.argument).toHaveProperty('id')
    expect(Array.isArray(detail.relations)).toBe(true)
    expect(detail.relations[0]).toHaveProperty('full_predicate')
  })
})
