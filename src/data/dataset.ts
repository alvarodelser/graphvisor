import corpus5 from './corpus_5.json'
import hypothesis5 from './hypothesis_5.json'
import corpus112 from './corpus_112.json'
import hypothesis112 from './hypothesis_112.json'

import docEmbeddings5Url from './corpus_5_doc_embeddings.bin?url'
import conceptEmbeddings5Url from './corpus_5_concept_embeddings.bin?url'
import concepts5 from './corpus_5_concepts.json'
import topics5 from './corpus_5_topics.json'

import docEmbeddings112Url from './corpus_112_doc_embeddings.bin?url'
import conceptEmbeddings112Url from './corpus_112_concept_embeddings.bin?url'
import concepts112 from './corpus_112_concepts.json'
import topics112 from './corpus_112_topics.json'

import type { Hypothesis } from '../types'

export type DatasetId = '5' | '112'

const isTest = typeof (globalThis as any).process !== 'undefined' &&
  ((globalThis as any).process.env?.NODE_ENV === 'test' || !!(globalThis as any).process.env?.VITEST)
/** Switch active dataset here (e.g. '5' → '112'). */
export const DATASET: DatasetId = isTest ? '5' : '112'

const CORPUS_BY_DATASET = {
  '5': corpus5,
  '112': corpus112,
} as const

const HYPOTHESIS_BY_DATASET = {
  '5': hypothesis5,
  '112': hypothesis112,
} as const

const DOC_EMBEDDINGS_URL_BY_DATASET = {
  '5': docEmbeddings5Url,
  '112': docEmbeddings112Url,
} as const

const CONCEPT_EMBEDDINGS_URL_BY_DATASET = {
  '5': conceptEmbeddings5Url,
  '112': conceptEmbeddings112Url,
} as const

const CONCEPTS_BY_DATASET = {
  '5': concepts5,
  '112': concepts112,
} as const

const TOPICS_BY_DATASET = {
  '5': topics5,
  '112': topics112,
} as const



export const CORPUS_FILE = `corpus_${DATASET}.json` as const
export const HYPOTHESIS_FILE = `hypothesis_${DATASET}.json` as const

// ConceptGrounding is what embed_concepts.py now writes into concepts.json
export interface ConceptGrounding {
  concept: string
  pca_x: number
  pca_y: number
  radius: number
}

export const corpusJson = CORPUS_BY_DATASET[DATASET]
export const docEmbeddingsUrl = DOC_EMBEDDINGS_URL_BY_DATASET[DATASET]
export const conceptEmbeddingsUrl = CONCEPT_EMBEDDINGS_URL_BY_DATASET[DATASET]

// conceptsJson is either the new {concept,pca_x,pca_y,radius}[] or legacy string[]
// We normalise to ConceptGrounding[] at runtime in DataService.
export const conceptsJson = CONCEPTS_BY_DATASET[DATASET] as unknown as ConceptGrounding[]
export const topicsJson = TOPICS_BY_DATASET[DATASET]

type RawHypothesis112 = {
  hypothesis: string
  scores: {
    novelty: number
    plausibility?: number
    impact?: number
    creativity?: number
    scientific_plausibility?: number
    potential_impact?: number
    commercial_potential?: number
  }
}

function normalizeHypotheses(raw: unknown): Hypothesis[] {
  if (Array.isArray(raw)) return raw as Hypothesis[]

  const grouped = raw as Record<string, RawHypothesis112[]>
  return Object.values(grouped).flatMap(items =>
    items.map(item => ({
      hypothesis: item.hypothesis,
      decision: 'BORDERLINE' as const,
      scores: {
        novelty: item.scores.novelty,
        scientific_plausibility: item.scores.scientific_plausibility ?? item.scores.plausibility ?? 5,
        potential_impact: item.scores.potential_impact ?? item.scores.impact ?? 5,
        commercial_potential: item.scores.commercial_potential ?? item.scores.creativity ?? 5,
      },
    })),
  )
}

export const hypothesisJson = normalizeHypotheses(HYPOTHESIS_BY_DATASET[DATASET])
