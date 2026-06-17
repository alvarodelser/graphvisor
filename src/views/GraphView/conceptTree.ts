import type { ArgumentBlob } from '../../types'

export interface ConceptTreeArg {
  id: string
  label: string                 // short label (argument_type)
  full: string                  // full argument text
  secondaryConceptIds: string[] // this arg's non-primary concept memberships
}
export interface ConceptTreeNode {
  id: string
  label: string
  args: ConceptTreeArg[]
}

// Concept id derived from a concept label. Mirrors graphModel's convention so the
// two stay aligned.
export const conceptIdOf = (label: string): string => `concept-${label}`

// An argument's primary (top-ranked) concept label.
export const primaryConceptLabel = (b: ArgumentBlob): string =>
  b.parent_concepts[0] ?? `concept-${b.concept_id}`

// Two-level tree: each argument is placed once under its top-ranked concept.
// Concepts are ordered by argument count (desc), then label.
export function buildConceptTree(blobs: ArgumentBlob[]): ConceptTreeNode[] {
  const map = new Map<string, ConceptTreeNode>()
  for (const b of blobs) {
    const label = primaryConceptLabel(b)
    const id = conceptIdOf(label)
    if (!map.has(id)) map.set(id, { id, label, args: [] })
    map.get(id)!.args.push({
      id: b.id,
      label: b.argument_type,
      full: b.full_argument,
      secondaryConceptIds: b.parent_concepts.slice(1).map(conceptIdOf),
    })
  }
  return [...map.values()].sort(
    (a, b) => b.args.length - a.args.length || (a.label < b.label ? -1 : 1),
  )
}
