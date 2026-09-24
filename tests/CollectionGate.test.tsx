import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollectionGate, decide } from '../src/components/CollectionGate/CollectionGate'

const info = (name: string, status: 'ready' | 'processing' | 'failed', done = 1, expected = 2) =>
  ({ name, status, expected, done, failed: 0, started_at: '2026-09-24T10:00:00Z', finished_at: null })

function serve(collections: unknown) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(collections)))))
}

function at(search: string) {
  window.history.replaceState(null, '', `/graphvisor/${search}`)
}

afterEach(() => { vi.unstubAllGlobals(); at('') })

describe('decide', () => {
  it('always asks to choose when no collection is named', () => {
    expect(decide([info('a', 'ready')], null).kind).toBe('choose')
  })
  it('opens a named, ready collection', () => {
    expect(decide([info('a', 'ready')], 'a').kind).toBe('open')
  })
  it('asks to choose when the named collection is not ready or unknown', () => {
    expect(decide([info('a', 'ready'), info('b', 'processing')], 'b').kind).toBe('choose')
    expect(decide([info('a', 'ready')], 'zzz').kind).toBe('choose')
  })
})

describe('CollectionGate', () => {
  it('lists collections: ready ones as buttons, processing ones with progress', async () => {
    serve([info('sci_corpus', 'ready', 142, 142), info('smoke', 'processing')])
    render(<CollectionGate><div>the app</div></CollectionGate>)
    expect(await screen.findByText('Choose a collection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sci_corpus/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /smoke/ })).toBeNull()
    expect(screen.getByLabelText('50% processed')).toBeInTheDocument()
    expect(screen.queryByText('the app')).toBeNull()
  })

  it('shows the finalize stage of a finalizing collection', async () => {
    serve([{ ...info('smoke', 'processing', 2), status: 'finalizing', stage: 'concept_validation' }])
    render(<CollectionGate><div>the app</div></CollectionGate>)
    expect(await screen.findByText('Building concepts and topics: concept validation')).toBeInTheDocument()
  })

  it('explains when the named collection is not ready', async () => {
    at('?collection=smoke')
    serve([info('smoke', 'processing')])
    render(<CollectionGate><div>the app</div></CollectionGate>)
    expect(await screen.findByText('“smoke” isn’t ready yet.')).toBeInTheDocument()
  })

  it('renders the app for a named, ready collection', async () => {
    at('?collection=smoke')
    serve([info('smoke', 'ready', 2)])
    render(<CollectionGate><div>the app</div></CollectionGate>)
    expect(await screen.findByText('the app')).toBeInTheDocument()
  })
})
