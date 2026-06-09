import { describe, it, expect } from 'vitest'
import { RealDataService } from '../src/data/DataService'

const svc = new RealDataService()

describe('RealDataService', () => {
  it('getDocuments returns non-empty array with required fields', async () => {
    const docs = await svc.getDocuments()
    expect(docs.length).toBeGreaterThan(0)
    expect(docs[0]).toHaveProperty('id')
    expect(docs[0]).toHaveProperty('pca_x')
    expect(docs[0]).toHaveProperty('top_terms')
  })

  it('getGraph with no filter returns all nodes, edges, and blobs', async () => {
    const { nodes, edges, blobs } = await svc.getGraph([])
    expect(nodes.length).toBeGreaterThan(0)
    expect(edges.length).toBeGreaterThan(0)
    expect(blobs.length).toBeGreaterThan(0)
    expect(nodes[0]).toHaveProperty('type')
    expect(edges[0]).toHaveProperty('group')
  })

  it('getGraph with document filter narrows results', async () => {
    const all = await svc.getGraph([])
    const filtered = await svc.getGraph(['doc_0'])
    expect(filtered.nodes.length).toBeLessThanOrEqual(all.nodes.length)
    expect(filtered.edges.length).toBeLessThanOrEqual(all.edges.length)
    expect(filtered.blobs.length).toBeLessThanOrEqual(all.blobs.length)
  })

  it('blobs have entityIds with at least 2 entries', async () => {
    const { blobs } = await svc.getGraph([])
    blobs.forEach(b => {
      expect(b.entityIds.length).toBeGreaterThanOrEqual(2)
      expect(b).toHaveProperty('full_argument')
      expect(b).toHaveProperty('source_document_id')
    })
  })

  it('getArgumentDetail for entity node returns relations', async () => {
    const { nodes } = await svc.getGraph([])
    const entityNode = nodes[0]
    const detail = await svc.getArgumentDetail(entityNode.id)
    expect(detail.argument).toHaveProperty('id', entityNode.id)
    expect(Array.isArray(detail.relations)).toBe(true)
    expect(detail.relations[0]).toHaveProperty('full_predicate')
  })

  it('getArgumentDetail for argument ID returns synthetic node', async () => {
    const { blobs } = await svc.getGraph([])
    const blob = blobs[0]
    const detail = await svc.getArgumentDetail(blob.id)
    expect(detail.argument.type).toBe('Argument')
    expect(detail.argument).toHaveProperty('full_text')
    expect(Array.isArray(detail.relations)).toBe(true)
    expect(detail.sources.length).toBeGreaterThan(0)
  })
})
