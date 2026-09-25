import { create } from 'zustand'
import {
  evaluationApi, type ApiScores, type ArgumentEvaluation, type ArgumentEvaluationIn,
  type HypothesisEvaluation, type HypothesisVerdict,
} from './evaluationApi'

// The researcher's own ratings in this collection. Rating is always optional
// and never blocks browsing; a failed save shows on the control that sent it.
interface EvaluationState {
  loaded: boolean
  hypotheses: Record<string, HypothesisEvaluation>
  arguments: Record<string, ArgumentEvaluation>
  // Detail opens the argument review expanded when Explore asks for it
  // ("Wrong" on the argument card, or "check its relations").
  reviewRequest: { blobId: string; argId: string; verdict: 'faithful' | 'wrong' } | null
  // A blind hypothesis whose scores are being filled in: its radar stays
  // hidden until that's saved or dismissed, so the model doesn't anchor them.
  scoringBlind: string | null
  load: () => Promise<void>
  rateHypothesis: (id: string, verdict: HypothesisVerdict, scores?: ApiScores, comment?: string | null) => Promise<HypothesisEvaluation>
  rateArgument: (argId: string, body: ArgumentEvaluationIn) => Promise<ArgumentEvaluation>
  requestReview: (r: EvaluationState['reviewRequest']) => void
  setScoringBlind: (id: string | null) => void
}

export const useEvaluations = create<EvaluationState>((set, get) => ({
  loaded: false,
  hypotheses: {},
  arguments: {},
  reviewRequest: null,
  scoringBlind: null,
  load: async () => {
    const mine = await evaluationApi.mine()
    set({ loaded: true, hypotheses: mine.hypotheses, arguments: mine.arguments })
  },
  rateHypothesis: async (id, verdict, scores, comment) => {
    const e = await evaluationApi.rateHypothesis(id, { verdict, scores, comment })
    set({ hypotheses: { ...get().hypotheses, [id]: e } })
    return e
  },
  rateArgument: async (argId, body) => {
    const e = await evaluationApi.rateArgument(argId, body)
    set({ arguments: { ...get().arguments, [argId]: e } })
    return e
  },
  requestReview: reviewRequest => set({ reviewRequest }),
  setScoringBlind: scoringBlind => set({ scoringBlind }),
}))

export const ratedCount = (s: EvaluationState) =>
  Object.keys(s.hypotheses).length + Object.keys(s.arguments).length
