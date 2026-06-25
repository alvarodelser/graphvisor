import corpus165 from './corpus_165.json'
import hypothesis165 from './hipothesis_165.json'

import docEmbeddings165Url from './corpus_165_doc_embeddings.bin?url'
import conceptEmbeddings165Url from './corpus_165_concept_embeddings.bin?url'
import concepts165 from './corpus_165_concepts.json'
import topics165 from './corpus_165_topics.json'

import type { Hypothesis } from '../types'

export interface ConceptGrounding {
  concept: string
  pca_x: number
  pca_y: number
  radius: number
}

export const corpusJson = corpus165
export const docEmbeddingsUrl = docEmbeddings165Url
export const conceptEmbeddingsUrl = conceptEmbeddings165Url
export const conceptsJson = concepts165 as unknown as ConceptGrounding[]
export const topicsJson = topics165

type RawHypothesisItem = {
  hypothesis: string
  evidence?: string | number | (string | number)[]
  rationale?: string
  research_question?: string
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

function normalizeEvidence(raw: string | number | (string | number)[] | undefined): string[] {
  if (!raw) return []
  const arr = Array.isArray(raw) ? raw : [raw]
  return arr.map(e => {
    const s = String(e)
    return s.startsWith('a') ? s : `a${s}`
  })
}

function normalizeScores(s: RawHypothesisItem['scores']): Hypothesis['scores'] {
  const novelty     = s.novelty
  const plausibility = s.scientific_plausibility ?? s.plausibility ?? 5
  const impact       = s.potential_impact ?? s.impact ?? 5
  const commercial   = s.commercial_potential ?? s.creativity ?? 5
  // Scores in range 0–1 need to be scaled to the 1–10 display scale
  const scale = novelty <= 1 ? 10 : 1
  return {
    novelty:                novelty     * scale,
    scientific_plausibility: plausibility * scale,
    potential_impact:        impact       * scale,
    commercial_potential:    commercial   * scale,
  }
}

function normalizeHypotheses(raw: unknown): Hypothesis[] {
  if (Array.isArray(raw)) return raw as Hypothesis[]

  const grouped = raw as Record<string, RawHypothesisItem[]>
  return Object.entries(grouped).flatMap(([concept, items]) =>
    items.map(item => ({
      hypothesis:        item.hypothesis,
      concept,
      evidence:          normalizeEvidence(item.evidence),
      rationale:         item.rationale,
      research_question: item.research_question,
      decision:          'BORDERLINE' as const,
      scores:            normalizeScores(item.scores),
    })),
  )
}

export const hypothesisJson = normalizeHypotheses(hypothesis165)
