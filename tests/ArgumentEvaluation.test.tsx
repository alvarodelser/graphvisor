import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ArgumentVerdict } from '../src/evaluation/ArgumentVerdict'
import { ArgumentReview } from '../src/evaluation/ArgumentReview'
import { useEvaluations } from '../src/evaluation/useEvaluations'
import { useStore } from '../src/store/useStore'
import type { ArgumentBlob, ArgumentDetail } from '../src/types'

const blob: ArgumentBlob = {
  id: 'doc_0_arg_1', arg_id: 'a7', entityIds: [], full_argument: 'Rapamycin restores flux.', argument_type: 'causal',
  confidence: 0.9, source_document_id: 'doc_0', source_document_title: 'Paper', concept_id: 0, parent_concepts: [],
}
const detail: ArgumentDetail = {
  arg_id: 'a7',
  argument: { id: 'doc_0_arg_1', type: 'Argument', label: 'causal', full_text: 'Rapamycin restores flux.', confidence: 0.9 },
  relations: [], sources: [],
  entityGraph: [{ subject: 'rapamycin', object: 'flux', relation_type: 'CAUSES', confidence: 0.9, group: 'causation' }],
}

let puts: unknown[] = []
beforeEach(() => {
  puts = []
  useEvaluations.setState({ loaded: true, hypotheses: {}, arguments: {}, reviewRequest: null, scoringBlind: null })
  useStore.setState({ activeView: 'graph', selectedArgumentId: null })
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/source')) {
      return Promise.resolve(new Response(JSON.stringify({ chunk_index: 0, title: 'Results', text: 'The passage.' })))
    }
    const body = JSON.parse(init!.body as string)
    puts.push(body)
    return Promise.resolve(new Response(JSON.stringify({ argument_id: 'a7', updated_at: 'now', ...body })))
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('argument evaluation', () => {
  it('Faithful saves and offers the closer check; Wrong goes straight to Detail', async () => {
    render(<ArgumentVerdict blob={blob} />)
    fireEvent.click(screen.getByRole('button', { name: 'Faithful' }))
    expect(await screen.findByText('Check its relations and entities ▸')).toBeInTheDocument()
    expect(useStore.getState().activeView).toBe('graph')

    fireEvent.click(screen.getByRole('button', { name: 'Wrong' }))
    await waitFor(() => expect(useStore.getState().activeView).toBe('detail'))
    expect(useStore.getState().selectedArgumentId).toBe('doc_0_arg_1')
    expect(useEvaluations.getState().reviewRequest).toEqual({ blobId: 'doc_0_arg_1', argId: 'a7', verdict: 'wrong' })
    expect(puts.map(p => (p as { verdict: string }).verdict)).toEqual(['faithful', 'wrong'])
  })

  it('Detail opens the review when asked, and saves reasons and per-part checks', async () => {
    useEvaluations.setState({ reviewRequest: { blobId: 'doc_0_arg_1', argId: 'a7', verdict: 'wrong' } })
    render(<ArgumentReview detail={detail} />)
    expect(await screen.findByText('What’s wrong?')).toBeInTheDocument()
    expect(await screen.findByText('The passage.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Misquoted / distorted' }))
    const [relWrong] = screen.getAllByTitle('Wrong')
    fireEvent.click(relWrong)
    fireEvent.change(screen.getByPlaceholderText('Why? (optional)'), { target: { value: 'it inhibits' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }))
    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(puts[0]).toEqual({
      verdict: 'wrong', reasons: ['misquoted'], corrected_type: null, comment: null,
      relations: [{ subject: 'rapamycin', relation: 'CAUSES', object: 'flux', verdict: 'wrong', comment: 'it inhibits' }],
      entities: [],
    })
  })

  it('stays one line in Detail when nobody asked', () => {
    render(<ArgumentReview detail={detail} />)
    expect(screen.getByText('Is this argument faithful to the paper?')).toBeInTheDocument()
    expect(screen.queryByText('Save review')).toBeNull()
  })
})
