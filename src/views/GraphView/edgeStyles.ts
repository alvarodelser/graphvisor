import * as d3 from 'd3'
import type { GraphEdge } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'
import { edgeStyleVariantFor } from '../../graph/relations'

// ── Chevron geometry (shared, perf-sensitive) ───────────────────────────────
// Inner chevrons are laid out once along a long fixed track and then translated
// by CSS (`march-forward` / `march-reverse`, ±CHEV_SPACING). A per-edge clip
// polygon (the outer shape) reveals only the visible portion, so the marching
// reads as continuous regardless of edge length.
export const CHEV_HALF_H = 6
export const CHEV_TIP_OFFSET = 8
export const CHEV_SPACING = 20
export const CHEV_TIP_REACH = 8
export const CHEV_COUNT = 28
export const CHEV_START = -28

const colorOf = (group: string) => (RELATION_COLORS as Record<string, string>)[group]
const fillOf = (group: string) => `${colorOf(group)}0f`

// Directional pentagon: body from the source (x=0) to a single tip at x=len.
export function directionalOuterPoints(len: number): string {
  const bodyEnd = Math.max(0, len - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${len},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}

// Symmetric hexagon centered on the origin: a tip at each end (-len/2, +len/2).
// Used for "association" (correlation) edges, which have no source/target.
export function associationOuterPoints(len: number): string {
  const half = len / 2
  const bodyEnd = Math.max(0, half - CHEV_TIP_OFFSET)
  return `${-half},0 ${-bodyEnd},${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${half},0 ${bodyEnd},${CHEV_HALF_H} ${-bodyEnd},${CHEV_HALF_H}`
}

export interface EdgeShape {
  variant: 'directional' | 'association' | 'plain'
  clipPoly?: SVGPolygonElement
  line?: SVGLineElement
}

type GSel = d3.Selection<SVGGElement, unknown, null, undefined>
type DefsSel = d3.Selection<SVGDefsElement, unknown, null, undefined>

function rightChevron(bx: number): string {
  return `${bx},${-CHEV_HALF_H} ${bx + CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`
}
function leftChevron(bx: number): string {
  return `${bx},${-CHEV_HALF_H} ${bx - CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`
}

// ── Directional edge: pentagon + forward-marching chevrons (the original look) ─
function buildDirectional(g: GSel, defs: DefsSel, edge: GraphEdge): EdgeShape {
  const clipPoly = defs.append('clipPath').attr('id', `edgeclip-${edge.id}`).attr('clipPathUnits', 'userSpaceOnUse')
    .append('polygon').attr('points', directionalOuterPoints(0))
  g.append('polygon').attr('class', 'chevron-outer')
    .attr('fill', fillOf(edge.group)).attr('stroke', colorOf(edge.group))
    .attr('stroke-width', 1).attr('stroke-linejoin', 'miter').attr('opacity', 0.85)
  const inner = g.append('g').attr('clip-path', `url(#edgeclip-${edge.id})`)
    .append('g').attr('class', 'chevrons-forward')
  for (let i = 0; i < CHEV_COUNT; i++) {
    const bx = CHEV_START + i * CHEV_SPACING
    inner.append('polyline').attr('points', rightChevron(bx))
      .attr('fill', 'none').attr('stroke', colorOf(edge.group)).attr('stroke-width', 3).attr('opacity', 0.65)
  }
  return { variant: 'directional', clipPoly: clipPoly.node()! }
}

// ── Association edge: double-ended hexagon, chevrons emanate from the midpoint ─
// Two marching tracks share one centered clip: the right half points/​marches
// outward (+x), the left half points/​marches outward (-x).
function buildAssociation(g: GSel, defs: DefsSel, edge: GraphEdge): EdgeShape {
  const clipPoly = defs.append('clipPath').attr('id', `edgeclip-${edge.id}`).attr('clipPathUnits', 'userSpaceOnUse')
    .append('polygon').attr('points', associationOuterPoints(0))
  g.append('polygon').attr('class', 'chevron-outer')
    .attr('fill', fillOf(edge.group)).attr('stroke', colorOf(edge.group))
    .attr('stroke-width', 1).attr('stroke-linejoin', 'miter').attr('opacity', 0.85)
  const clipped = g.append('g').attr('clip-path', `url(#edgeclip-${edge.id})`)
  const right = clipped.append('g').attr('class', 'chevrons-forward')
  const left = clipped.append('g').attr('class', 'chevrons-reverse')
  for (let i = 0; i < CHEV_COUNT; i++) {
    const bx = i * CHEV_SPACING
    right.append('polyline').attr('points', rightChevron(bx))
      .attr('fill', 'none').attr('stroke', colorOf(edge.group)).attr('stroke-width', 3).attr('opacity', 0.65)
    left.append('polyline').attr('points', leftChevron(-bx))
      .attr('fill', 'none').attr('stroke', colorOf(edge.group)).attr('stroke-width', 3).attr('opacity', 0.65)
  }
  return { variant: 'association', clipPoly: clipPoly.node()! }
}

// ── Lean edge: a plain straight line, no pentagon/chevrons/clip-path ──────────
// Used in Lean LOD where edge decoration is too costly to draw per frame.
function buildPlain(g: GSel, edge: GraphEdge): EdgeShape {
  const line = g.append('line').attr('class', 'edge-plain')
    .attr('stroke', colorOf(edge.group)).attr('stroke-width', 1.5).attr('opacity', 0.55)
  return { variant: 'plain', line: line.node()! }
}

// Build the right edge DOM for an edge based on its group. Returns a handle the
// per-tick positioner uses (no per-frame DOM queries). In Lean LOD all edges are
// plain straight lines.
export function buildEdgeShape(g: GSel, defs: DefsSel, edge: GraphEdge, plain = false): EdgeShape {
  if (plain) return buildPlain(g, edge)
  return edgeStyleVariantFor(edge.group) === 'association'
    ? buildAssociation(g, defs, edge)
    : buildDirectional(g, defs, edge)
}

// Position an edge between two endpoints. Directional edges anchor at the source
// (local origin = source); association edges anchor at the midpoint so the
// chevrons radiate from the center.
export function positionEdgeShape(
  g: GSel, shape: EdgeShape, x1: number, y1: number, x2: number, y2: number,
): void {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx) * (180 / Math.PI)
  if (shape.variant === 'plain') {
    const ln = shape.line!
    ln.setAttribute('x1', String(x1)); ln.setAttribute('y1', String(y1))
    ln.setAttribute('x2', String(x2)); ln.setAttribute('y2', String(y2))
    return
  }
  if (shape.variant === 'association') {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    g.attr('transform', `translate(${mx},${my}) rotate(${angle})`)
    const pts = associationOuterPoints(len)
    g.select('.chevron-outer').attr('points', pts)
    shape.clipPoly!.setAttribute('points', pts)
  } else {
    g.attr('transform', `translate(${x1},${y1}) rotate(${angle})`)
    const pts = directionalOuterPoints(len)
    g.select('.chevron-outer').attr('points', pts)
    shape.clipPoly!.setAttribute('points', pts)
  }
}
