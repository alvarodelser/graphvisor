import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BlindRadar, HypothesisRating } from '../src/evaluation/HypothesisRating'
import { useEvaluations } from '../src/evaluation/useEvaluations'
import type { Hypothesis } from '../src/types'

const hyp = (blind: boolean): Hypothesis => ({
  id: 'c:k:0', blind, hypothesis: 'H0', concept: 'k', evidence: [], decision: 'BORDERLINE',
  scores: { novelty: 8, scientific_plausibility: 6, potential_impact: 7, commercial_potential: 5 },
})

let bodies: unknown[] = []
beforeEach(() => {
  bodies = []
  useEvaluations.setState({ loaded: true, hypotheses: {}, arguments: {}, reviewRequest: null, scoringBlind: null })
  vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string)
    bodies.push(body)
    const human = body.scores ? Object.fromEntries(Object.entries(body.scores).map(([k, v]) => [`human_${k}`, v])) : {}
    return Promise.resolve(new Response(JSON.stringify({
      target_uid: 'c:k:0', verdict: body.verdict, blind: false, comment: body.comment, updated_at: 'now', ...human,
    })))
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('HypothesisRating', () => {
  it('saves the verdict at once, then offers the scores prefilled with the model’s', async () => {
    render(<HypothesisRating hypothesis={hyp(false)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Promising' }))
    expect(await screen.findByText('Would you adjust the scores?')).toBeInTheDocument()
    expect(bodies[0]).toEqual({ verdict: 'promising', comment: null })
    const sliders = screen.getAllByRole('slider') as HTMLInputElement[]
    expect(sliders.map(s => s.value)).toEqual(['8', '6', '7', '5'])
    fireEvent.change(sliders[1], { target: { value: '3' } })
    expect(screen.getByText('model 6.0')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/Anything to add/), { target: { value: 'needs a control' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(bodies).toHaveLength(2))
    expect(bodies[1]).toEqual({ verdict: 'promising', comment: 'needs a control',
      scores: { novelty: 8, plausibility: 3, impact: 7, creativity: 5 } })
  })

  it('keeps a blind hypothesis’ radar hidden until rated and scored', async () => {
    const h = hyp(true)
    render(<>
      <HypothesisRating hypothesis={h} />
      <BlindRadar hypothesis={h}><div>radar</div></BlindRadar>
    </>)
    expect(screen.getByText('Rate to reveal')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Unsure' }))
    expect(await screen.findByText(/model’s scores show once you save/)).toBeInTheDocument()
    expect(screen.getByText('Rate to reveal')).toBeInTheDocument()  // still hidden while scoring
    expect(screen.getAllByText('–')).toHaveLength(4)                // nothing prefilled
    fireEvent.change(screen.getAllByRole('slider')[0], { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Set all four scores, or none')
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByText('Rate to reveal')).toBeNull())
  })
})
