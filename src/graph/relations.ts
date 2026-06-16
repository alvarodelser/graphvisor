import type { RelationGroup } from '../types'

// ── Relation taxonomy ─────────────────────────────────────────────────────────
// Relations are grouped by the *epistemic role* they play (what kind of claim
// they make about A and B), not by polarity. Four semantic groups + the
// separate `concept` membership group.
//
//   evidence    "A is a tool for discovering B"   supports, reveals, suggests, contradicts
//   correlation "A and B behave similarly"        correlates_with, associated_with, analogous_to
//   causation   "A influences B · B depends on A" causes, increases, decreases, inhibits, induces, may_cause
//   definition  "A explains B"                    describes, is_defined_as
export const RELATION_GROUP_MAP: Record<string, RelationGroup> = {
  supports:        'evidence',
  reveals:         'evidence',
  suggests:        'evidence',
  contradicts:     'evidence',
  correlates_with: 'correlation',
  associated_with: 'correlation',
  analogous_to:    'correlation',
  causes:          'causation',
  increases:       'causation',
  decreases:       'causation',
  inhibits:        'causation',
  induces:         'causation',
  may_cause:       'causation',
  describes:       'definition',
  is_defined_as:   'definition',
}

// Unknown relation types fall back to `evidence` — the most neutral "makes some
// claim about B" default.
export function relationGroupOf(relationType: string): RelationGroup {
  return RELATION_GROUP_MAP[relationType.toLowerCase()] ?? 'evidence'
}

export type EdgeStyleVariant = 'directional' | 'association'

// Correlation is symmetric ("behaves similarly") and renders as the
// bidirectional, center-out association edge. Every other group is directional.
export function edgeStyleVariantFor(group: RelationGroup): EdgeStyleVariant {
  return group === 'correlation' ? 'association' : 'directional'
}
