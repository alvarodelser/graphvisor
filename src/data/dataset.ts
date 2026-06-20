import corpus112 from './corpus_112.json'
import hypothesis112 from './hypothesis_112.json'

import docEmbeddings112Url from './corpus_112_doc_embeddings.bin?url'
import conceptEmbeddings112Url from './corpus_112_concept_embeddings.bin?url'
import concepts112 from './corpus_112_concepts.json'
import topics112 from './corpus_112_topics.json'

import type { Hypothesis } from '../types'

export interface ConceptGrounding {
  concept: string
  pca_x: number
  pca_y: number
  radius: number
}

export const corpusJson = corpus112
export const docEmbeddingsUrl = docEmbeddings112Url
export const conceptEmbeddingsUrl = conceptEmbeddings112Url
export const conceptsJson = concepts112 as unknown as ConceptGrounding[]
export const topicsJson = topics112

type RawHypothesis112 = {
  hypothesis: string
  evidence?: string
  rationale?: string
  scores: {
    novelty: number
    scientific_plausibility?: number
    plausibility?: number
    potential_impact?: number
    impact?: number
    commercial_potential?: number
    creativity?: number
  }
}

function normalizeHypotheses(raw: unknown): Hypothesis[] {
  if (Array.isArray(raw)) return raw as Hypothesis[]

  const grouped = raw as Record<string, RawHypothesis112[]>
  return Object.entries(grouped).flatMap(([concept, items]) =>
    items.map(item => ({
      hypothesis: item.hypothesis,
      concept,
      evidence: item.evidence ?? '',
      rationale: item.rationale,
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

export const hypothesisJson = normalizeHypotheses(hypothesis112)
