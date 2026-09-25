import { api } from '../data/api'
import { currentCollection } from '../data/DataService'

export type HypothesisVerdict = 'promising' | 'unsure' | 'not_useful'
export type ArgumentVerdict = 'faithful' | 'wrong'
export type ArgumentReason = 'not_in_paper' | 'misquoted' | 'claims_merged' | 'wrong_type' | 'other'
export type PartVerdict = 'correct' | 'wrong'

// The API's four criteria, and the frontend's names for them (types/index.ts).
export const CRITERIA = [
  { api: 'novelty', key: 'novelty', label: 'Novelty' },
  { api: 'plausibility', key: 'scientific_plausibility', label: 'Plausibility' },
  { api: 'impact', key: 'potential_impact', label: 'Impact' },
  { api: 'creativity', key: 'commercial_potential', label: 'Creativity' },
] as const
export type ApiScores = Record<(typeof CRITERIA)[number]['api'], number>

export interface HypothesisEvaluation {
  target_uid: string
  verdict: HypothesisVerdict
  blind: boolean
  comment?: string | null
  human_novelty?: number
  human_plausibility?: number
  human_impact?: number
  human_creativity?: number
  updated_at: string
}

export interface RelationCheck { subject: string; relation: string; object: string; verdict: PartVerdict; comment?: string }
export interface EntityCheck { name: string; verdict: PartVerdict; comment?: string }

export interface ArgumentEvaluationIn {
  verdict: ArgumentVerdict
  reasons?: ArgumentReason[]
  corrected_type?: string | null
  comment?: string | null
  relations?: RelationCheck[]
  entities?: EntityCheck[]
}

export interface ArgumentEvaluation extends Required<Omit<ArgumentEvaluationIn, 'corrected_type' | 'comment'>> {
  argument_id: string
  corrected_type?: string | null
  comment?: string | null
  updated_at: string
}

export interface Mine {
  hypotheses: Record<string, HypothesisEvaluation>
  arguments: Record<string, ArgumentEvaluation>
}

export interface SourcePassage { chunk_index: number; title: string | null; text: string }

const base = () => `/collections/${encodeURIComponent(currentCollection())}`

export const evaluationApi = {
  mine: () => api<Mine>(`${base()}/evaluations/mine`),
  rateHypothesis: (id: string, body: { verdict: HypothesisVerdict; scores?: ApiScores; comment?: string | null }) =>
    api<HypothesisEvaluation>(`${base()}/hypotheses/${encodeURIComponent(id)}/evaluation`, { method: 'PUT', body }),
  rateArgument: (argId: string, body: ArgumentEvaluationIn) =>
    api<ArgumentEvaluation>(`${base()}/arguments/${encodeURIComponent(argId)}/evaluation`, { method: 'PUT', body }),
  source: (argId: string) => api<SourcePassage>(`${base()}/arguments/${encodeURIComponent(argId)}/source`),
}

// Implicit signals (copying, following evidence, searching…): fire and forget.
export function track(type: string, target?: string | null, data: Record<string, unknown> = {}) {
  api('/events', { method: 'POST', body: { type, collection: currentCollection() || null, target: target ?? null, data } })
    .catch(() => { /* a lost signal must never bother the researcher */ })
}
