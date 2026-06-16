import type { Topic } from '../../types'

/** Adaptive cluster count: clamp(round(sqrt(n/2)), 2, 12), never exceeding n. */
export function pickK(n: number): number {
  const raw = Math.round(Math.sqrt(n / 2))
  const clamped = Math.max(2, Math.min(12, raw))
  return Math.min(clamped, n)
}

/** Most frequent label across docs; ties broken lexicographically. '' if none. */
export function mostFrequentLabel(labelLists: string[][]): string {
  const counts = new Map<string, number>()
  for (const list of labelLists)
    for (const label of list) counts.set(label, (counts.get(label) ?? 0) + 1)
  let best = ''
  let bestCount = 0
  for (const [label, count] of counts) {
    if (count > bestCount || (count === bestCount && (best === '' || label < best))) {
      best = label
      bestCount = count
    }
  }
  return best
}

/** Group docs by their cluster assignment into Topic records. */
export function buildTopics(
  assignments: number[],
  docs: { id: string; argument_count: number }[],
  labels: Map<number, string>,
): Topic[] {
  const byCluster = new Map<number, { docIds: string[]; argCount: number }>()
  docs.forEach((doc, i) => {
    const c = assignments[i]
    if (!byCluster.has(c)) byCluster.set(c, { docIds: [], argCount: 0 })
    const entry = byCluster.get(c)!
    entry.docIds.push(doc.id)
    entry.argCount += doc.argument_count
  })
  return Array.from(byCluster.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, { docIds, argCount }]) => ({
      id,
      label: labels.get(id) ?? `Topic ${id}`,
      docIds,
      argCount,
    }))
}
