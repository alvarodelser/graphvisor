import type { Hypothesis } from '../types'

// GraphVisor reads a collection from the ingestion worker's read API
// (services/worker/app/api). The API serves the same shapes the static files
// used to have: corpus JSON, topics, concept groundings and float32 embeddings.
// In development, vite.config.ts proxies this path to the local worker.
export const API_BASE: string = import.meta.env.VITE_GRAPHVISOR_API ?? '/graphvisor/api'

export interface ConceptGrounding {
  concept: string
  pca_x: number
  pca_y: number
  radius: number
}

export interface CollectionInfo {
  name: string
  status: 'processing' | 'ready' | 'failed'
  expected: number
  done: number
  failed: number
}

export interface Dataset {
  collection: string
  corpus: unknown[]
  topics: Array<{ id: number; label: string; docIds: string[]; argCount: number }>
  concepts: ConceptGrounding[]
  hypotheses: Hypothesis[]
  docEmbeddingsUrl: string
  conceptEmbeddingsUrl: string
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

export function listCollections(): Promise<CollectionInfo[]> {
  return getJson<CollectionInfo[]>('/collections')
}

// The collection shown is ?collection=<name>, else the first ready one.
export async function resolveCollection(): Promise<string> {
  const requested = new URLSearchParams(window.location.search).get('collection')
  if (requested) return requested
  const ready = (await listCollections()).find(c => c.status === 'ready')
  if (!ready) throw new Error('No ready collection on the GraphVisor API')
  return ready.name
}

export async function loadDataset(collection: string): Promise<Dataset> {
  const base = `/collections/${encodeURIComponent(collection)}`
  const [corpus, topics, concepts, hypotheses] = await Promise.all([
    getJson<unknown[]>(`${base}/corpus`),
    getJson<Dataset['topics']>(`${base}/topics`),
    getJson<ConceptGrounding[]>(`${base}/concepts`),
    getJson<unknown>(`${base}/hypotheses`),
  ])
  return {
    collection,
    corpus,
    topics,
    concepts,
    hypotheses: normalizeHypotheses(hypotheses),
    docEmbeddingsUrl: `${API_BASE}${base}/doc_embeddings.bin`,
    conceptEmbeddingsUrl: `${API_BASE}${base}/concept_embeddings.bin`,
  }
}

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
  const novelty = s.novelty
  const plausibility = s.scientific_plausibility ?? s.plausibility ?? 5
  const impact = s.potential_impact ?? s.impact ?? 5
  const commercial = s.commercial_potential ?? s.creativity ?? 5
  // Scores in range 0–1 need to be scaled to the 1–10 display scale
  const scale = novelty <= 1 ? 10 : 1
  return {
    novelty: novelty * scale,
    scientific_plausibility: plausibility * scale,
    potential_impact: impact * scale,
    commercial_potential: commercial * scale,
  }
}

function normalizeHypotheses(raw: unknown): Hypothesis[] {
  if (Array.isArray(raw)) return raw as Hypothesis[]

  const grouped = raw as Record<string, RawHypothesisItem[]>
  return Object.entries(grouped).flatMap(([concept, items]) =>
    items.map(item => ({
      hypothesis: item.hypothesis,
      concept,
      evidence: normalizeEvidence(item.evidence),
      rationale: item.rationale,
      research_question: item.research_question,
      decision: 'BORDERLINE' as const,
      scores: normalizeScores(item.scores),
    })),
  )
}

