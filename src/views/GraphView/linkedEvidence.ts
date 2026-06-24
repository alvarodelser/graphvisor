// Resolves the hypothesis→argument links (`hypothesis.evidence` = arg_id strings)
// to the set of blob ids present in the current view.
export function linkedEvidenceBlobIds(
  hypotheses: { hypothesis: string; evidence?: string[] }[],
  selectedHypothesisIds: string[],
  blobs: { id: string; arg_id?: string }[],
): Set<string> {
  if (selectedHypothesisIds.length === 0) return new Set()
  const selected = new Set(selectedHypothesisIds)
  const evidence = new Set(
    hypotheses
      .filter(h => selected.has(h.hypothesis) && h.evidence?.length)
      .flatMap(h => h.evidence!),
  )
  if (evidence.size === 0) return new Set()
  return new Set(blobs.filter(b => b.arg_id && evidence.has(b.arg_id)).map(b => b.id))
}
