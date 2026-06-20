import { describe, it, expect } from 'vitest'
import { linkedEvidenceBlobIds } from './linkedEvidence'

const hyp = (hypothesis: string, evidence: string) => ({ hypothesis, evidence })
const blob = (id: string, arg_id?: string) => ({ id, arg_id })

describe('linkedEvidenceBlobIds', () => {
  it('is empty when no hypotheses are selected', () => {
    const out = linkedEvidenceBlobIds([hyp('H1', 'a5')], [], [blob('doc_0_arg_1', 'a5')])
    expect(out.size).toBe(0)
  })

  it('maps a selected hypothesis evidence arg_id to its blob id', () => {
    const out = linkedEvidenceBlobIds(
      [hyp('H1', 'a5'), hyp('H2', 'a9')],
      ['H1'],
      [blob('doc_0_arg_1', 'a5'), blob('doc_2_arg_0', 'a9')],
    )
    expect([...out]).toEqual(['doc_0_arg_1'])
  })

  it('unions evidence across multiple selected hypotheses', () => {
    const out = linkedEvidenceBlobIds(
      [hyp('H1', 'a5'), hyp('H2', 'a9')],
      ['H1', 'H2'],
      [blob('doc_0_arg_1', 'a5'), blob('doc_2_arg_0', 'a9')],
    )
    expect(out).toEqual(new Set(['doc_0_arg_1', 'doc_2_arg_0']))
  })

  it('ignores evidence with no matching blob (e.g. argument had <2 entities)', () => {
    const out = linkedEvidenceBlobIds([hyp('H1', 'a404')], ['H1'], [blob('doc_0_arg_1', 'a5')])
    expect(out.size).toBe(0)
  })
})
