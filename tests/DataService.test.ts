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

describe('entity detail — argument blobs and source_argument_id', () => {
  it('entity detail includes a non-empty argumentBlobs array', async () => {
    const { nodes } = await svc.getGraph([])
    // find an entity that appears in multi-entity arguments (has blobs)
    let detail = null
    for (const node of nodes) {
      const d = await svc.getArgumentDetail(node.id)
      if ((d.argumentBlobs ?? []).length > 0) { detail = d; break }
    }
    expect(detail).not.toBeNull()
    expect(Array.isArray(detail!.argumentBlobs)).toBe(true)
    expect(detail!.argumentBlobs!.length).toBeGreaterThan(0)
  })

  it('entity detail relations all have a valid source_argument_id', async () => {
    const { nodes } = await svc.getGraph([])
    // find an entity with at least one relation
    let detail = null
    for (const node of nodes) {
      const d = await svc.getArgumentDetail(node.id)
      if (d.relations.length > 0) { detail = d; break }
    }
    expect(detail).not.toBeNull()
    let checked = 0
    for (const rel of detail!.relations) {
      expect(rel.source_argument_id).toMatch(/^doc_\d+_arg_\d+$/)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it('argumentBlobs each contain the queried entity id', async () => {
    const { nodes } = await svc.getGraph([])
    const entityNode = nodes[0]
    const detail = await svc.getArgumentDetail(entityNode.id)
    for (const blob of detail.argumentBlobs ?? []) {
      expect(blob.entityIds).toContain(entityNode.id)
    }
  })

  it('argument blob detail does not include argumentBlobs', async () => {
    const { blobs } = await svc.getGraph([])
    const detail = await svc.getArgumentDetail(blobs[0].id)
    expect(detail.argumentBlobs).toBeUndefined()
  })
})

describe('RealDataService.getArgumentDetail — reasoning', () => {
  it('argument relations carry a reasoning string', async () => {
    const { blobs } = await svc.getGraph([])
    const detail = await svc.getArgumentDetail(blobs[0].id)
    const withReasoning = detail.relations.filter(r => typeof r.reasoning === 'string' && r.reasoning.length > 0)
    expect(withReasoning.length).toBeGreaterThan(0)
  })
})

describe('RealDataService.getConceptDetail', () => {
  it('returns arguments and per-document stats for a concept', async () => {
    const conceptName = 'Mismatch repair–mediated suppression of homeologous recombination'
    const cd = await svc.getConceptDetail(conceptName)
    expect(cd.label).toBe(conceptName)
    expect(cd.conceptId).toBe('concept-' + conceptName)
    expect(cd.arguments.length).toBeGreaterThan(0)
    expect(cd.arguments[0]).toHaveProperty('full_argument')
    expect(cd.arguments[0].id).toMatch(/^doc_\d+_arg_\d+$/)
    // docStats cover every document; withConcept never exceeds total; sums match
    const docs = await svc.getDocuments()
    expect(cd.docStats.length).toBe(docs.length)
    cd.docStats.forEach(s => expect(s.withConcept).toBeLessThanOrEqual(s.total))
    const totalWith = cd.docStats.reduce((n, s) => n + s.withConcept, 0)
    expect(totalWith).toBe(cd.arguments.length)
  })

  it('returns empty arguments for an unknown concept', async () => {
    const cd = await svc.getConceptDetail('no-such-concept-xyz')
    expect(cd.arguments).toHaveLength(0)
    expect(cd.docStats.every(s => s.withConcept === 0)).toBe(true)
  })
})

describe('RealDataService.getHypotheses', () => {
  it('returns hypotheses with required fields', async () => {
    const hypotheses = await svc.getHypotheses()
    expect(hypotheses.length).toBeGreaterThan(0)
    expect(hypotheses[0]).toHaveProperty('hypothesis')
    expect(hypotheses[0]).toHaveProperty('decision')
    expect(hypotheses[0].decision).toMatch(/^(ADVANCE|BORDERLINE)$/)
    expect(hypotheses[0].scores).toHaveProperty('novelty')
    expect(hypotheses[0].scores).toHaveProperty('scientific_plausibility')
    expect(hypotheses[0].scores).toHaveProperty('potential_impact')
    expect(hypotheses[0].scores).toHaveProperty('commercial_potential')
  })

  it('all scores are numbers between 1 and 10', async () => {
    const hypotheses = await svc.getHypotheses()
    for (const h of hypotheses) {
      for (const v of Object.values(h.scores)) {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(10)
      }
    }
  })
})
