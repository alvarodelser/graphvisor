import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HypothesisCard } from '../src/views/DiscoverView/HypothesisCard'
import type { Hypothesis } from '../src/types'

const advanceHyp: Hypothesis = {
  hypothesis: 'Test hypothesis text for ADVANCE decision.',
  decision: 'ADVANCE',
  scores: { novelty: 9, scientific_plausibility: 8, potential_impact: 9, commercial_potential: 8 },
}

const borderlineHyp: Hypothesis = {
  hypothesis: 'Test hypothesis text for BORDERLINE decision.',
  decision: 'BORDERLINE',
  scores: { novelty: 7, scientific_plausibility: 7, potential_impact: 8, commercial_potential: 6 },
}

describe('HypothesisCard', () => {
  it('renders ADVANCE badge', () => {
    render(<HypothesisCard hypothesis={advanceHyp} />)
    expect(screen.getByText('ADVANCE')).toBeInTheDocument()
  })

  it('renders BORDERLINE badge', () => {
    render(<HypothesisCard hypothesis={borderlineHyp} />)
    expect(screen.getByText('BORDERLINE')).toBeInTheDocument()
  })

  it('renders average score for ADVANCE (8.5)', () => {
    render(<HypothesisCard hypothesis={advanceHyp} />)
    expect(screen.getByText(/8\.5/)).toBeInTheDocument()
  })

  it('renders average score for BORDERLINE (7.0)', () => {
    render(<HypothesisCard hypothesis={borderlineHyp} />)
    // (7+7+8+6)/4 = 7.0
    expect(screen.getByText(/7\.0/)).toBeInTheDocument()
  })

  it('renders score pills N, P, I, C', () => {
    render(<HypothesisCard hypothesis={advanceHyp} />)
    expect(screen.getByText('N 9')).toBeInTheDocument()
    expect(screen.getByText('P 8')).toBeInTheDocument()
    expect(screen.getByText('I 9')).toBeInTheDocument()
    expect(screen.getByText('C 8')).toBeInTheDocument()
  })

  it('renders hypothesis text', () => {
    render(<HypothesisCard hypothesis={advanceHyp} />)
    expect(screen.getByText('Test hypothesis text for ADVANCE decision.')).toBeInTheDocument()
  })
})
