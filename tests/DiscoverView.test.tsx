import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DiscoverView } from '../src/views/DiscoverView/DiscoverView'

// vi.mock is hoisted before imports by vitest. Data is inlined in the factory
// so it doesn't reference module-scope variables (which would be undefined when hoisted).
vi.mock('../src/data/DataService', () => ({
  dataService: {
    getHypotheses: () => Promise.resolve([
      {
        hypothesis: 'Alpha hypothesis ADVANCE.',
        decision: 'ADVANCE',
        scores: { novelty: 9, scientific_plausibility: 8, potential_impact: 9, commercial_potential: 8 },
      },
      {
        hypothesis: 'Beta hypothesis ADVANCE.',
        decision: 'ADVANCE',
        scores: { novelty: 7, scientific_plausibility: 8, potential_impact: 7, commercial_potential: 8 },
      },
      {
        hypothesis: 'Gamma hypothesis BORDERLINE.',
        decision: 'BORDERLINE',
        scores: { novelty: 7, scientific_plausibility: 7, potential_impact: 8, commercial_potential: 6 },
      },
    ]),
    getDocuments: () => Promise.resolve([]),
    getGraph: () => Promise.resolve({ nodes: [], edges: [], blobs: [] }),
    getArgumentDetail: () => Promise.resolve({ argument: {}, relations: [], sources: [] }),
  },
}))

describe('DiscoverView', () => {
  it('renders all hypotheses on load', async () => {
    render(<DiscoverView />)
    await waitFor(() => {
      expect(screen.getByText('Alpha hypothesis ADVANCE.')).toBeInTheDocument()
      expect(screen.getByText('Beta hypothesis ADVANCE.')).toBeInTheDocument()
      expect(screen.getByText('Gamma hypothesis BORDERLINE.')).toBeInTheDocument()
    })
  })

  it('shows correct counts on filter chips', async () => {
    render(<DiscoverView />)
    await waitFor(() => {
      expect(screen.getByText('All 3')).toBeInTheDocument()
      expect(screen.getByText('ADVANCE 2')).toBeInTheDocument()
      expect(screen.getByText('BORDERLINE 1')).toBeInTheDocument()
    })
  })

  it('clicking ADVANCE filter shows only ADVANCE hypotheses', async () => {
    render(<DiscoverView />)
    await waitFor(() => screen.getByText('ADVANCE 2'))
    fireEvent.click(screen.getByText('ADVANCE 2'))
    expect(screen.getByText('Alpha hypothesis ADVANCE.')).toBeInTheDocument()
    expect(screen.getByText('Beta hypothesis ADVANCE.')).toBeInTheDocument()
    expect(screen.queryByText('Gamma hypothesis BORDERLINE.')).not.toBeInTheDocument()
  })

  it('clicking BORDERLINE filter shows only BORDERLINE hypotheses', async () => {
    render(<DiscoverView />)
    await waitFor(() => screen.getByText('BORDERLINE 1'))
    fireEvent.click(screen.getByText('BORDERLINE 1'))
    expect(screen.queryByText('Alpha hypothesis ADVANCE.')).not.toBeInTheDocument()
    expect(screen.getByText('Gamma hypothesis BORDERLINE.')).toBeInTheDocument()
  })

  it('clicking All resets the filter', async () => {
    render(<DiscoverView />)
    await waitFor(() => screen.getByText('ADVANCE 2'))
    fireEvent.click(screen.getByText('ADVANCE 2'))
    fireEvent.click(screen.getByText('All 3'))
    expect(screen.getByText('Gamma hypothesis BORDERLINE.')).toBeInTheDocument()
  })
})
