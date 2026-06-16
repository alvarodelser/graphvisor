import { describe, it, expect } from 'vitest'
import { computeWedgeLayout } from './wedgeLayout'
import { buildGraphModel } from './graphModel'
import type { ArgumentBlob } from '../types'

const blob = (id: string, concepts: string[]): ArgumentBlob => ({
  id, entityIds: [], full_argument: 'x', argument_type: 'mechanistic', confidence: 1,
  source_document_id: 'doc_0', source_document_title: 'doc', concept_id: 1, parent_concepts: concepts,
})

const TAU = Math.PI * 2

describe('computeWedgeLayout', () => {
  it('partitions the orbit into one even arc per concept', () => {
    const blobs = [blob('a0', ['C1']), blob('a1', ['C2']), blob('a2', ['C3']), blob('a3', ['C4'])]
    const model = buildGraphModel([], [], blobs)
    const L = computeWedgeLayout(model)

    const ids = [...L.conceptSector.keys()].sort()
    expect(ids).toEqual(['concept-C1', 'concept-C2', 'concept-C3', 'concept-C4'])
    // each concept owns an equal arc of the circle…
    for (const id of ids) {
      const s = L.conceptSector.get(id)!
      expect(s.end - s.start).toBeCloseTo(TAU / 4)
    }
    // …and the arcs are contiguous (each sector ends where the next begins)
    const sorted = ids.map(id => L.conceptSector.get(id)!).sort((a, b) => a.start - b.start)
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeCloseTo(sorted[i - 1].end)
    }
  })

  it('places a single-concept argument inside its concept arc', () => {
    const blobs = [blob('a0', ['C1']), blob('a1', ['C2']), blob('a2', ['C3']), blob('a3', ['C4'])]
    const model = buildGraphModel([], [], blobs)
    const L = computeWedgeLayout(model)

    const s = L.conceptSector.get('concept-C1')!
    const ang = L.argAngle.get('a0')!
    expect(ang).toBeGreaterThanOrEqual(s.start)
    expect(ang).toBeLessThanOrEqual(s.end)
  })

  it('drifts a multi-concept argument to the blend of its concepts (the seam)', () => {
    const blobs = [
      blob('a0', ['C1']), blob('a1', ['C2']), blob('a2', ['C3']), blob('a3', ['C4']),
      blob('x', ['C1', 'C2']),
    ]
    const model = buildGraphModel([], [], blobs)
    const L = computeWedgeLayout(model)

    const c1 = L.conceptAngle.get('concept-C1')!   // 0
    const c2 = L.conceptAngle.get('concept-C2')!   // TAU/4
    const ang = L.argAngle.get('x')!
    // sits at the circular mean of its two concepts, strictly between them
    expect(ang).toBeCloseTo((c1 + c2) / 2)
    expect(ang).toBeGreaterThan(c1)
    expect(ang).toBeLessThan(c2)
  })
})
