import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { Shell } from '../src/components/Shell/Shell'
import { useStore } from '../src/store/useStore'

const hypotheses = vi.hoisted(() => ({ list: [] as unknown[] }))

vi.mock('../src/data/DataService', () => ({
  dataService: {
    getHypotheses: () => Promise.resolve(hypotheses.list),
    getDocuments: () => Promise.resolve([]),
  },
  currentCollection: () => 'smoke',
}))
vi.mock('../src/data/dataset', () => ({ listCollections: () => Promise.resolve([]) }))

const exploreTab = () => within(screen.getByRole('navigation')).getByRole('button', { name: /Explore/ })

const renderShell = () => render(
  <Shell>
    <div>corpus</div><div>discover</div><div>graph</div><div>detail</div>
  </Shell>,
)

describe('Shell navigation', () => {
  beforeEach(() => {
    useStore.setState({ activeView: 'corpus', selectedDocumentIds: ['doc_0'], selectedHypothesisIds: [] })
  })

  it('without hypotheses, Explore opens straight from the document selection', async () => {
    hypotheses.list = []
    renderShell()
    await waitFor(() => expect(exploreTab()).toBeEnabled())
    fireEvent.click(screen.getByText('Go to Explore'))
    expect(useStore.getState().activeView).toBe('graph')
  })

  it('with hypotheses, Explore still waits for a hypothesis selection', async () => {
    hypotheses.list = [{ hypothesis: 'h', scores: {} }]
    renderShell()
    expect(await screen.findByText('Go to Discover')).toBeInTheDocument()
    expect(exploreTab()).toBeDisabled()
  })
})
