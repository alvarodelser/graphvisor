// A small collection as the worker's read API serves it
// (services/worker/app/api/corpus.py), for tests that go through DataService.

const rel = (subject: string, relation: string, object: string, source_argument_id: number) => ({
  subject, relation, object, argument_type: 'causal', epistemic_strength: 'strong',
  confidence: 0.9, source_argument_id, reasoning: `${subject} ${relation} ${object}`,
})

const arg = (arg_id: string, text: string, relations: ReturnType<typeof rel>[], concepts: string[]) => ({
  arg_id, full_argument: text, argument_type: 'causal', confidence: 0.9, reasoning: 'stated',
  relations,
  concept_level: {
    concept_id: 1, parent_concepts: concepts, parent_concepts_cos: concepts.map(() => 0.8),
    descriptions: concepts.map(() => 'd'), epistemic_strength: concepts.map(() => 'high'),
    confidence: concepts.map(() => 0.9),
  },
})

export const corpus = [
  {
    source: 'Autophagy flux protects neurons', year: '2024', abstract: 'A', citations: 12,
    pca_x: 0.1, pca_y: 0.2, topic_id: 0,
    data: [
      arg('a1', 'Atg7 loss causes inclusion bodies that impair neurons.',
          [rel('Atg7 loss', 'causes', 'inclusion bodies', 0), rel('inclusion bodies', 'inhibits', 'neurons', 0)],
          ['Autophagy', 'Neurodegeneration']),
      arg('a2', 'Rapamycin increases autophagic flux.',
          [rel('rapamycin', 'increases', 'autophagic flux', 1)], ['Autophagy']),
    ],
  },
  {
    source: 'Proteostasis in aging', year: '2021', abstract: 'B', citations: 3,
    pca_x: -0.3, pca_y: 0.4, topic_id: 1,
    data: [
      arg('a3', 'Inclusion bodies correlate with aging neurons.',
          [rel('inclusion bodies', 'correlates_with', 'aging', 0), rel('aging', 'associated_with', 'neurons', 0)],
          ['Neurodegeneration']),
    ],
  },
]

export const topics = [
  { id: 0, label: 'Autophagy', docIds: ['doc_0'], argCount: 2 },
  { id: 1, label: 'Aging', docIds: ['doc_1'], argCount: 1 },
]

export const concepts = [
  { concept: 'Autophagy', pca_x: 0.1, pca_y: 0.2, radius: 0.15 },
  { concept: 'Neurodegeneration', pca_x: -0.1, pca_y: 0.3, radius: 0.2 },
]

// Grouped by concept, as hypothesis files were: exercises normalizeHypotheses.
export const hypotheses = {
  Autophagy: [{
    hypothesis: 'Boosting autophagy delays neurodegeneration.', evidence: [1, 'a3'],
    research_question: 'Does it?', scores: { novelty: 0.7, plausibility: 0.8, impact: 0.6, creativity: 0.5 },
  }],
}

function vectors(n: number): ArrayBuffer {
  const out = new Float32Array(n * 1024)
  for (let i = 0; i < n; i++) out[i * 1024 + i] = 1
  return out.buffer
}

// fetch() stand-in for the API under /graphvisor/api.
export function apiFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input)
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
  if (url.endsWith('/collections')) {
    return Promise.resolve(json([{ name: 'test', status: 'ready', expected: 2, done: 2, failed: 0 }]))
  }
  if (url.endsWith('/corpus')) return Promise.resolve(json(corpus))
  if (url.endsWith('/topics')) return Promise.resolve(json(topics))
  if (url.endsWith('/concepts')) return Promise.resolve(json(concepts))
  if (url.endsWith('/hypotheses')) return Promise.resolve(json(hypotheses))
  if (url.includes('/search/arguments')) {
    return Promise.resolve(json({ query: 'q', results: [
      { arg_id: 'a3', document_id: 'X', text: 'Inclusion bodies correlate with aging neurons.', argument_type: 'causal', score: 0.91 },
      { arg_id: 'a999', document_id: 'Y', text: 'not in this corpus', argument_type: 'causal', score: 0.5 },
    ] }))
  }
  if (url.endsWith('/doc_embeddings.bin')) return Promise.resolve(new Response(vectors(corpus.length)))
  if (url.endsWith('/concept_embeddings.bin')) return Promise.resolve(new Response(vectors(concepts.length)))
  return Promise.resolve(new Response('not found', { status: 404 }))
}
