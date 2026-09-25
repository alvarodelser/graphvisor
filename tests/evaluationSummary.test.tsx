import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { summarize, type EvaluationRecord } from '../src/auth/evaluationSummary'
import { EvaluationsOverview } from '../src/auth/EvaluationsOverview'

const hyp = (user: string, verdict: string, extra: Partial<EvaluationRecord> = {}): EvaluationRecord => ({
  kind: 'hypothesis', target_uid: 'c:k:0', target_text: 'H0', concept: 'Autophagy', user_uid: user,
  user_name: user, verdict, blind: false, model_novelty: 8, model_plausibility: 6, model_impact: 7, model_creativity: 5,
  updated_at: '2026-09-25T10:00:00.123456789Z', ...extra,
})
const records: EvaluationRecord[] = [
  hyp('ana', 'promising', { human_novelty: 8, human_plausibility: 6, human_impact: 7, human_creativity: 5,
                            adjusted_novelty: false, adjusted_plausibility: false, adjusted_impact: false, adjusted_creativity: false }),
  hyp('ben', 'unsure', { blind: true, comment: 'needs a control', human_novelty: 4, human_plausibility: 6,
                         human_impact: 3, human_creativity: 5, adjusted_novelty: true, adjusted_plausibility: false,
                         adjusted_impact: true, adjusted_creativity: false }),
  { kind: 'argument', target_uid: 'c:d:1', argument_id: 'a7', target_text: 'Rapamycin restores flux.',
    argument_type: 'causal', user_uid: 'ben', user_name: 'ben', verdict: 'wrong', reasons: ['misquoted'],
    relations: [{ subject: 'rapamycin', relation: 'CAUSES', object: 'flux', verdict: 'wrong', comment: 'inhibits' }],
    entities: [{ name: 'flux', verdict: 'correct' }], comment: 'aged mice only', updated_at: '2026-09-25T11:00:00Z' },
]

describe('summarize', () => {
  const s = summarize(records)
  it('counts ratings, people and verdicts', () => {
    expect([s.total, s.raters]).toEqual([3, 2])
    expect(s.hypotheses.verdicts).toEqual({ promising: 1, unsure: 1, not_useful: 0 })
    expect(s.arguments).toMatchObject({ rated: 1, faithful: 0, wrong: 1, wrongRelations: 1, wrongEntities: 0 })
    expect(s.arguments.reasons.misquoted).toBe(1)
  })
  it('compares people with the model, blind and shown apart', () => {
    const novelty = s.hypotheses.criteria.find(c => c.criterion === 'novelty')!
    expect(novelty).toMatchObject({ model: 8, humanOpen: 8, humanBlind: 4, gapOpen: 0, gapBlind: 4, adjusted: 0.5, scored: 2 })
  })
  it('groups per item, with comments and the parts marked wrong', () => {
    expect(s.hypotheses.rows[0]).toMatchObject({ ratings: 2, human: { novelty: 6 }, model: { novelty: 8 } })
    expect(s.hypotheses.rows[0].comments).toEqual([{ who: 'ben', verdict: 'unsure', text: 'needs a control', at: records[1].updated_at }])
    expect(s.arguments.rows[0].wrongParts).toEqual([{ part: 'rapamycin causes flux', who: 'ben', comment: 'inhibits' }])
    expect(s.people.map(p => [p.name, p.hypotheses, p.arguments])).toEqual([['ben', 1, 1], ['ana', 1, 0]])
  })
})

describe('EvaluationsOverview', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('loads a collection’s ratings and shows the comments on demand', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(records)))))
    render(<EvaluationsOverview collections={[{ name: 'c', status: 'ready', expected: 1, done: 1, failed: 0 }]} />)
    expect(await screen.findByText('3 ratings by 2 people')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1 comment' }))
    expect(screen.getByText(/needs a control/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'details (2)' }))
    expect(screen.getByText('rapamycin causes flux')).toBeInTheDocument()
  })
})
