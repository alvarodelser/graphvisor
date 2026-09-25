// Summaries of the ratings exported by GET /api/admin/evaluations, for the
// admin page. One record per person per rated item.

export const CRITERIA = ['novelty', 'plausibility', 'impact', 'creativity'] as const
export type Criterion = (typeof CRITERIA)[number]
const VERDICTS_H = ['promising', 'unsure', 'not_useful'] as const
const REASONS = ['not_in_paper', 'misquoted', 'claims_merged', 'wrong_type', 'other'] as const

export interface EvaluationRecord {
  kind: 'hypothesis' | 'argument'
  target_uid: string
  target_text?: string | null
  concept?: string | null
  argument_id?: string
  argument_type?: string | null
  user_uid: string
  user_name?: string
  user_email?: string
  verdict: string
  comment?: string | null
  blind?: boolean
  reasons?: string[]
  corrected_type?: string | null
  relations?: { subject: string; relation: string; object: string; verdict: string; comment?: string }[]
  entities?: { name: string; verdict: string; comment?: string }[]
  updated_at?: string
  [key: string]: unknown
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const count = <K extends string>(keys: readonly K[], values: string[]) =>
  Object.fromEntries(keys.map(k => [k, values.filter(v => v === k).length])) as Record<K, number>

export interface CriterionRow {
  criterion: Criterion
  model: number | null          // mean model score of the rated hypotheses (1–10)
  humanOpen: number | null      // mean human score where the model's was shown
  humanBlind: number | null     // … and where it was hidden
  gapOpen: number | null        // mean |human − model|, shown
  gapBlind: number | null       // … hidden: a much smaller gap when shown suggests anchoring
  adjusted: number              // share of scored ratings that moved the model's number
  scored: number
}

export interface Comment { who: string; verdict: string; text: string; at?: string }

export interface HypothesisRow {
  uid: string
  text: string
  concept: string | null
  ratings: number
  verdicts: Record<(typeof VERDICTS_H)[number], number>
  human: Partial<Record<Criterion, number>>
  model: Partial<Record<Criterion, number>>
  comments: Comment[]
}

export interface ArgumentRow {
  argumentId: string
  text: string
  type: string | null
  ratings: number
  faithful: number
  wrong: number
  reasons: Record<string, number>
  correctedTypes: string[]
  wrongParts: { part: string; who: string; comment?: string }[]
  comments: Comment[]
}

export interface RaterRow { uid: string; name: string; email: string; hypotheses: number; arguments: number; last?: string }

export interface Summary {
  total: number
  raters: number
  hypotheses: { rated: number; ratings: number; verdicts: Record<(typeof VERDICTS_H)[number], number>;
                criteria: CriterionRow[]; rows: HypothesisRow[] }
  arguments: { rated: number; ratings: number; faithful: number; wrong: number;
               reasons: Record<(typeof REASONS)[number], number>; wrongRelations: number; wrongEntities: number;
               rows: ArgumentRow[] }
  people: RaterRow[]
}

const who = (e: EvaluationRecord) => e.user_name || e.user_email || e.user_uid

export function summarize(records: EvaluationRecord[]): Summary {
  const hyps = records.filter(e => e.kind === 'hypothesis')
  const args = records.filter(e => e.kind === 'argument')

  const criteria: CriterionRow[] = CRITERIA.map(c => {
    const scored = hyps.filter(e => num(e[`human_${c}`]) !== null)
    const pairs = (blind: boolean) => scored
      .filter(e => !!e.blind === blind && num(e[`model_${c}`]) !== null)
      .map(e => ({ h: num(e[`human_${c}`])!, m: num(e[`model_${c}`])! }))
    const open = pairs(false), hidden = pairs(true)
    return {
      criterion: c,
      model: mean(hyps.map(e => num(e[`model_${c}`])).filter((v): v is number => v !== null)),
      humanOpen: mean(open.map(p => p.h)),
      humanBlind: mean(hidden.map(p => p.h)),
      gapOpen: mean(open.map(p => Math.abs(p.h - p.m))),
      gapBlind: mean(hidden.map(p => Math.abs(p.h - p.m))),
      adjusted: scored.length ? scored.filter(e => e[`adjusted_${c}`] === true).length / scored.length : 0,
      scored: scored.length,
    }
  })

  const byTarget = <T,>(list: EvaluationRecord[], key: (e: EvaluationRecord) => string, make: (g: EvaluationRecord[]) => T) => {
    const groups = new Map<string, EvaluationRecord[]>()
    for (const e of list) groups.set(key(e), [...(groups.get(key(e)) ?? []), e])
    return [...groups.values()].map(make)
  }
  const comments = (g: EvaluationRecord[]): Comment[] => g
    .filter(e => e.comment && String(e.comment).trim())
    .map(e => ({ who: who(e), verdict: e.verdict, text: String(e.comment), at: e.updated_at }))

  const hypRows = byTarget(hyps, e => e.target_uid, (g): HypothesisRow => ({
    uid: g[0].target_uid,
    text: g[0].target_text ?? '',
    concept: g[0].concept ?? null,
    ratings: g.length,
    verdicts: count(VERDICTS_H, g.map(e => e.verdict)),
    human: Object.fromEntries(CRITERIA.map(c => [c, mean(g.map(e => num(e[`human_${c}`])).filter((v): v is number => v !== null))])
      .filter(([, v]) => v !== null)),
    model: Object.fromEntries(CRITERIA.map(c => [c, num(g[0][`model_${c}`])]).filter(([, v]) => v !== null)),
    comments: comments(g),
  })).sort((a, b) => b.ratings - a.ratings || b.comments.length - a.comments.length)

  const argRows = byTarget(args, e => e.argument_id ?? e.target_uid, (g): ArgumentRow => ({
    argumentId: g[0].argument_id ?? g[0].target_uid,
    text: g[0].target_text ?? '',
    type: g[0].argument_type ?? null,
    ratings: g.length,
    faithful: g.filter(e => e.verdict === 'faithful').length,
    wrong: g.filter(e => e.verdict === 'wrong').length,
    reasons: count(REASONS, g.flatMap(e => e.reasons ?? [])),
    correctedTypes: [...new Set(g.map(e => e.corrected_type).filter((t): t is string => !!t))],
    wrongParts: g.flatMap(e => [
      ...(e.relations ?? []).filter(r => r.verdict === 'wrong')
        .map(r => ({ part: `${r.subject} ${r.relation.toLowerCase().replace(/_/g, ' ')} ${r.object}`, who: who(e), comment: r.comment })),
      ...(e.entities ?? []).filter(x => x.verdict === 'wrong').map(x => ({ part: x.name, who: who(e), comment: x.comment })),
    ]),
    comments: comments(g),
  })).sort((a, b) => b.wrong - a.wrong || b.ratings - a.ratings)

  const people = byTarget(records, e => e.user_uid, (g): RaterRow => ({
    uid: g[0].user_uid,
    name: g[0].user_name ?? '',
    email: g[0].user_email ?? '',
    hypotheses: g.filter(e => e.kind === 'hypothesis').length,
    arguments: g.filter(e => e.kind === 'argument').length,
    last: g.map(e => e.updated_at ?? '').sort().pop() || undefined,
  })).sort((a, b) => b.hypotheses + b.arguments - (a.hypotheses + a.arguments))

  return {
    total: records.length,
    raters: people.length,
    hypotheses: {
      rated: hypRows.length, ratings: hyps.length, verdicts: count(VERDICTS_H, hyps.map(e => e.verdict)),
      criteria, rows: hypRows,
    },
    arguments: {
      rated: argRows.length, ratings: args.length,
      faithful: args.filter(e => e.verdict === 'faithful').length,
      wrong: args.filter(e => e.verdict === 'wrong').length,
      reasons: count(REASONS, args.flatMap(e => e.reasons ?? [])),
      wrongRelations: args.reduce((n, e) => n + (e.relations ?? []).filter(r => r.verdict === 'wrong').length, 0),
      wrongEntities: args.reduce((n, e) => n + (e.entities ?? []).filter(x => x.verdict === 'wrong').length, 0),
      rows: argRows,
    },
    people,
  }
}
