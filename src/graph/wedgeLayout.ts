import type { GraphModel } from './graphModel'

// Deterministic radial-hierarchy layout for the zoomed-out (collapsed) view.
// Each concept owns an equal arc ("sector") of the orbit and renders as a
// circular-arc segment; its arguments are placed inside that wedge. Arguments
// belonging to several concepts drift to the circular mean of those concepts'
// angles (the shared seam — the "M2" rule).
//
// Angles only, radius-independent: renderFrame converts an angle to a screen
// position at whatever ring radius the current entity cloud dictates.
export interface WedgeLayout {
  conceptAngle: Map<string, number>                          // sector centre (radians)
  conceptSector: Map<string, { start: number; end: number }> // arc bounds (radians)
  argAngle: Map<string, number>                              // argument target angle
}

const TAU = Math.PI * 2

function circularMean(angles: number[]): number {
  let sx = 0, sy = 0
  for (const a of angles) { sx += Math.cos(a); sy += Math.sin(a) }
  return Math.atan2(sy, sx)
}

const conceptIdsOf = (arg: { parent_concepts: string[] }): string[] =>
  arg.parent_concepts.map(l => `concept-${l}`)

export function computeWedgeLayout(model: GraphModel): WedgeLayout {
  const conceptIds = [...model.conceptArgs.keys()].sort()
  const n = conceptIds.length || 1
  const width = TAU / n

  const conceptAngle = new Map<string, number>()
  const conceptSector = new Map<string, { start: number; end: number }>()
  conceptIds.forEach((id, i) => {
    const c = i * width
    conceptAngle.set(id, c)
    conceptSector.set(id, { start: c - width / 2, end: c + width / 2 })
  })

  const argAngle = new Map<string, number>()

  // Single-concept arguments: fan them across their concept's arc so siblings
  // don't stack. Grouped + sorted for a stable order.
  const singleByConcept = new Map<string, string[]>()
  for (const arg of model.arguments) {
    const parents = conceptIdsOf(arg).filter(id => conceptAngle.has(id))
    if (parents.length > 1) continue
    const primary = model.argConcept.get(arg.id)
    if (primary == null || !conceptAngle.has(primary)) continue
    if (!singleByConcept.has(primary)) singleByConcept.set(primary, [])
    singleByConcept.get(primary)!.push(arg.id)
  }
  for (const [cid, ids] of singleByConcept) {
    const centre = conceptAngle.get(cid)!
    ids.sort()
    const m = ids.length
    ids.forEach((aid, i) => {
      const frac = m === 1 ? 0 : i / (m - 1) - 0.5
      argAngle.set(aid, centre + frac * width * 0.7)
    })
  }

  // Multi-concept arguments: drift to the circular mean of their concept arcs.
  for (const arg of model.arguments) {
    const parents = conceptIdsOf(arg).filter(id => conceptAngle.has(id))
    if (parents.length <= 1) continue
    argAngle.set(arg.id, circularMean(parents.map(id => conceptAngle.get(id)!)))
  }

  // Fallback: any argument whose concepts aren't in the layout lands at its
  // primary concept's centre, or angle 0 if it has none.
  for (const arg of model.arguments) {
    if (argAngle.has(arg.id)) continue
    const primary = model.argConcept.get(arg.id)
    argAngle.set(arg.id, primary != null && conceptAngle.has(primary) ? conceptAngle.get(primary)! : 0)
  }

  return { conceptAngle, conceptSector, argAngle }
}
