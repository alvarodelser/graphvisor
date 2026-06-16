import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState, ArgumentBlob } from '../../types'
import { buildEdgeShape, positionEdgeShape, type EdgeShape } from './edgeStyles'
import { buildGraphModel } from '../../graph/graphModel'
import { computeBlobPath } from '../../graph/blobGeometry'
import {
  computeChainCenters, chainHomeForce, argLayoutForce, bridgePullForce, blobRepulsionForce,
} from '../../graph/forces'
import { computeCollapse } from '../../graph/collapse'
import {
  ringRadius, stepRingBodies, conceptLinkPath, type RingBody,
} from '../../graph/conceptOrbit'
import { computeWedgeLayout } from '../../graph/wedgeLayout'
import { stepSoftBodies, type SoftBody } from '../../graph/softBodies'

const ENTITY_R = 8
// Argument collapses to a card when k·√(entityCount) < COLLAPSE_K. Low value ⇒
// entities stay visible at normal zoom; arguments only collapse once well zoomed
// out, and bigger (more-entity) arguments persist longer than small ones.
const COLLAPSE_K = 0.6
// Radial-hierarchy rings (graph units beyond the entity cloud). Collapsed
// argument cards sit on the inner ring at their concept's wedge angle; concept
// arcs sit further out so links travel inward without crossing.
const ARG_RING_MARGIN = 110
const CONCEPT_GAP = 110

// Argument card (blob-style rounded rectangle holding the argument text)
const ARG_CARD_W = 96         // graph units
const ARG_CARD_H = 34
const ARG_CARD_RX = 9
const ARG_TEXT_CHARS = 16     // chars per wrapped line
const ARG_TEXT_LINES = 2      // max lines of argument text shown inside the card
const ARG_LINE_H = 8          // line height, graph units
const ARG_REPEL = 60          // soft-body separation for the larger cards

// Greedy word-wrap into at most `maxLines` lines of ~`maxChars`, ellipsising overflow.
function wrapArgText(raw: string, maxChars: number, maxLines: number): string[] {
  const words = raw.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let cur = ''
  let wi = 0
  for (; wi < words.length; wi++) {
    const next = cur ? `${cur} ${words[wi]}` : words[wi]
    if (next.length <= maxChars) { cur = next; continue }
    if (cur) { lines.push(cur); cur = '' }
    if (lines.length >= maxLines) break
    cur = words[wi].length > maxChars ? words[wi].slice(0, maxChars) : words[wi]
  }
  if (cur && lines.length < maxLines) { lines.push(cur); wi++ }
  if (wi < words.length && lines.length > 0) {
    const last = lines[lines.length - 1]
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
  }
  return lines
}

// Argument/concept nodes grow as you zoom out so the plot stays readable.
// scale = 1 at k>=1, rising toward MAX_NODE_SCALE as k shrinks.
const MAX_NODE_SCALE = 2.6
const nodeScaleFor = (k: number) => Math.min(MAX_NODE_SCALE, Math.max(1, Math.sqrt(1 / Math.max(k, 1e-3))))

interface HoverPayload { type: 'node'; node: GraphNode; x: number; y: number }
interface EdgeHoverPayload { type: 'edge'; edge: GraphEdge; sourceNode: GraphNode; targetNode: GraphNode; x: number; y: number }
interface BlobHoverPayload { type: 'blob'; blob: ArgumentBlob; x: number; y: number }
interface ConceptHoverPayload { type: 'concept'; conceptId: string; label: string; argCount: number; x: number; y: number }
export type HoverItem = HoverPayload | EdgeHoverPayload | BlobHoverPayload | ConceptHoverPayload | null

interface ConceptClickPayload { conceptId: string; label: string; argCount: number }

interface Options {
  filters: FilterState
  selectedNodeId: string | null
  blobs: ArgumentBlob[]
  showBlobs: boolean
  selectedArgumentId: string | null
  selectedConceptId: string | null
  onNodeClick: (node: GraphNode) => void
  onBlobClick: (blob: ArgumentBlob) => void
  onConceptClick: (payload: ConceptClickPayload) => void
  onHover?: (item: HoverItem) => void
  onCanvasClick?: () => void
}

const BLOB_STROKE = 'rgba(100,116,139,0.12)'
const BLOB_FILL = 'rgba(100,116,139,0.04)'
const BLOB_STROKE_SEL = 'rgba(100,116,139,0.6)'
const BLOB_FILL_SEL = 'rgba(100,116,139,0.13)'

export function useGraphD3(
  svgRef: RefObject<SVGSVGElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: Options,
) {
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge>>()
  const optsRef = useRef(opts)
  optsRef.current = opts
  const zoomKRef = useRef(1)
  const argBodiesRef = useRef(new Map<string, SoftBody>())
  const argPinnedRef = useRef(new Map<string, { x: number; y: number }>())
  const conceptBodiesRef = useRef(new Map<string, RingBody>())
  const conceptPinnedRef = useRef(new Map<string, number>())
  const highlightFnRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    argBodiesRef.current.clear()
    argPinnedRef.current.clear()
    conceptBodiesRef.current.clear()
    conceptPinnedRef.current.clear()
    svg.style('background', '#fafbfc')
    let alive = true

    svg.on('click', () => optsRef.current.onCanvasClick?.())

    // ── Model ────────────────────────────────────────────────────────────────
    const { minConfidence, relationTypes } = optsRef.current.filters
    const fEdges = edges.filter(e =>
      e.confidence >= minConfidence && relationTypes[e.relation_type] !== false)
    const model = buildGraphModel(nodes, fEdges, optsRef.current.blobs)
    // Deterministic radial-hierarchy angles for the collapsed view: each concept
    // owns an arc sector; collapsed cards sit at their wedge angle inside it.
    const wedge = computeWedgeLayout(model)

    // Entities are ALWAYS simulated so arguments keep meaningful positions (their
    // member centroid) even when entity nodes are hidden. The Entity filter only
    // controls on-screen visibility, handled per-frame in renderFrame.
    const simNodes: GraphNode[] = model.entities.map(n => ({ ...n }))
    const simNodeIds = new Set(simNodes.map(n => n.id))
    const simEdges: GraphEdge[] = model.edges
      .filter(e => {
        const s = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
        const t = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        return simNodeIds.has(s) && simNodeIds.has(t)
      })
      .map(e => ({ ...e }))

    // Arguments left with no surviving members render as standalone nodes at all zooms
    const nodeOnlyArgIds = model.arguments
      .filter(a => (model.argMembers.get(a.id)?.length ?? 0) === 0)
      .map(a => a.id)

    const centers = computeChainCenters(model, width, height)
    // Pre-position each entity near its chain center
    simNodes.forEach(n => {
      const home = centers.get(model.chainOf.get(n.id)!) ?? { x: width / 2, y: height / 2 }
      const spread = Math.sqrt(model.chainSizes.get(model.chainOf.get(n.id)!) ?? 1) * 30
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * spread
      n.x = home.x + Math.cos(a) * r
      n.y = home.y + Math.sin(a) * r
      n.vx = 0; n.vy = 0
    })

    // ── Layers ───────────────────────────────────────────────────────────────
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const defs = svg.append('defs')
    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 14; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2).attr('r', i * 240)
        .attr('fill', 'none').attr('stroke', 'rgba(7,59,76,0.35)')
        .attr('stroke-width', 1).attr('stroke-dasharray', '4 8')
    }
    const blobG = zoomG.append('g').attr('class', 'blobs')
    const conceptEdgeG = zoomG.append('g').attr('class', 'concept-edges')
    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')
    const argNodeG = zoomG.append('g').attr('class', 'arg-nodes')
    const conceptNodeG = zoomG.append('g').attr('class', 'concept-nodes')

    // ── Zoom ─────────────────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (e) => {
        zoomG.attr('transform', e.transform)
        zoomKRef.current = e.transform.k
        scheduleRender()   // recompute LOD live during zoom, even when the sim is idle
      })
    svg.call(zoom)

    // ── Edge groups (chevron style) ───────────────────────────────────────────
    // Cache each edge's clip-path polygon node so the tick can update it without
    // a per-frame document query (`#edgeclip-…`), which was a scroll-perf hot spot.
    // Cache each edge's shape handle (clip polygon node + variant) so the tick
    // can update geometry without a per-frame document query.
    const edgeShapeById = new Map<string, EdgeShape>()
    const edgeGroups = edgeG.selectAll<SVGGElement, GraphEdge>('g.edge-group')
      .data(simEdges, d => d.id).join('g').attr('class', 'edge-group').style('cursor', 'pointer')
    edgeGroups.each(function (d) {
      const g = d3.select(this)
      edgeShapeById.set(d.id, buildEdgeShape(g, defs, d))
      g.append('title').text(`${d.relation_type} · ${d.confidence.toFixed(2)}`)
    })
    edgeGroups
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({
          type: 'edge', edge: d, sourceNode: d.source as GraphNode, targetNode: d.target as GraphNode, x: mx, y: my,
        })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))

    // ── Blobs ─────────────────────────────────────────────────────────────────
    const blobPaths = blobG.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
      .data(model.arguments, d => d.id).join('path').attr('class', 'blob')
      .attr('fill', BLOB_FILL).attr('stroke', BLOB_STROKE)
      .attr('stroke-width', 1.5).attr('pointer-events', 'fill').style('cursor', 'pointer')
      .on('click', (event, d) => { event.stopPropagation(); optsRef.current.onBlobClick(d) })
      .on('mouseenter', function (event, d) {
        applyArgHighlight(d.id)
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'blob', blob: d, x: mx, y: my })
      })
      .on('mouseleave', () => { applySticky(); optsRef.current.onHover?.(null) })

    // Blob drag: move members, soft-anchor on release
    interface DragMember { node: GraphNode; relX: number; relY: number }
    let dragMembers: DragMember[] = []
    let dragCX = 0, dragCY = 0, dragSX = 0, dragSY = 0
    blobPaths.call(
      d3.drag<SVGPathElement, ArgumentBlob>()
        .on('start', (event, d) => {
          event.sourceEvent.stopPropagation()
          if (!event.active) sim.alphaTarget(0.3).restart()
          dragSX = event.x; dragSY = event.y
          const members = (model.argMembers.get(d.id) ?? [])
            .map(id => simNodes.find(n => n.id === id)).filter((n): n is GraphNode => !!n)
          dragCX = members.reduce((s, n) => s + (n.x ?? 0), 0) / (members.length || 1)
          dragCY = members.reduce((s, n) => s + (n.y ?? 0), 0) / (members.length || 1)
          dragMembers = members.map(n => ({ node: n, relX: (n.x ?? 0) - dragCX, relY: (n.y ?? 0) - dragCY }))
          dragMembers.forEach(({ node }) => { node.fx = node.x; node.fy = node.y })
        })
        .on('drag', (event) => {
          const ncx = dragCX + (event.x - dragSX), ncy = dragCY + (event.y - dragSY)
          dragMembers.forEach(({ node, relX, relY }) => { node.fx = ncx + relX; node.fy = ncy + relY })
        })
        .on('end', (event) => {
          if (!event.active) sim.alphaTarget(0)
          dragMembers.forEach(({ node }) => { node.fx = null; node.fy = null; node.vx = 0; node.vy = 0 })
          dragMembers = []
        }),
    )

    // ── Entity nodes ───────────────────────────────────────────────────────────
    const nodeGroups = nodeG.selectAll<SVGGElement, GraphNode>('g')
      .data(simNodes, d => d.id).join('g').style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null }),
      )
      .on('click', (event, d) => { event.stopPropagation(); optsRef.current.onNodeClick(d) })
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'node', node: d, x: mx, y: my })
        d3.select(event.currentTarget as SVGGElement).select('.node-label').attr('opacity', 1)
      })
      .on('mouseleave', (event) => {
        optsRef.current.onHover?.(null)
        d3.select(event.currentTarget as SVGGElement).select('.node-label').attr('opacity', 0)
      })
    nodeGroups.each(function (d) {
      const g = d3.select(this)
      g.append('circle').attr('r', ENTITY_R).attr('fill', '#118ab2')
      g.append('title').text(d.label)
      g.append('text').attr('class', 'node-label').attr('y', 20).attr('text-anchor', 'middle')
        .attr('pointer-events', 'none').attr('fill', '#118ab2').attr('font-size', '8px')
        .attr('font-weight', '600').attr('opacity', 0).text(d.label)
    })

    // ── Collapsed argument nodes ────────────────────────────────────────────────
    const argNodeGroups = argNodeG.selectAll<SVGGElement, ArgumentBlob>('g.arg-node')
      .data(model.arguments, d => d.id).join('g').attr('class', 'arg-node')
      .style('display', 'none').style('cursor', 'pointer')
      .on('click', (event, d) => { event.stopPropagation(); optsRef.current.onBlobClick(d) })
      .on('mouseenter', function (event, d) {
        applyArgHighlight(d.id)
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'blob', blob: d, x: mx, y: my })
      })
      .on('mouseleave', function () {
        applySticky()
        optsRef.current.onHover?.(null)
      })
      .call(
        d3.drag<SVGGElement, ArgumentBlob>()
          .on('start', (event) => {
            event.sourceEvent.stopPropagation()
            if (!event.active) sim.alphaTarget(0.2).restart()
          })
          .on('drag', (event, d) => { argPinnedRef.current.set(d.id, { x: event.x, y: event.y }) })
          .on('end', (event) => { if (!event.active) sim.alphaTarget(0) }),
      )
    // Blob-style rounded card holding a couple of wrapped lines of the argument.
    argNodeGroups.each(function (d) {
      const g = d3.select(this)
      g.append('rect').attr('x', -ARG_CARD_W / 2).attr('y', -ARG_CARD_H / 2)
        .attr('width', ARG_CARD_W).attr('height', ARG_CARD_H).attr('rx', ARG_CARD_RX)
        .attr('fill', 'rgba(7,59,76,0.06)').attr('stroke', 'rgba(7,59,76,0.32)').attr('stroke-width', 1.5)
      const lines = wrapArgText(d.full_argument, ARG_TEXT_CHARS, ARG_TEXT_LINES)
      const y0 = -((lines.length - 1) * ARG_LINE_H) / 2
      const text = g.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
        .attr('pointer-events', 'none').attr('fill', 'rgba(7,59,76,0.85)')
        .attr('font-size', '7px').attr('font-weight', '600')
      lines.forEach((ln, i) => {
        text.append('tspan').attr('x', 0).attr('y', y0 + i * ARG_LINE_H).text(ln)
      })
      g.append('title').text(d.full_argument)
    })

    // ── Concept nodes ───────────────────────────────────────────────────────────
    const conceptIds = [...model.conceptArgs.keys()]
    const conceptNodeGroups = conceptNodeG.selectAll<SVGGElement, string>('g.concept-node')
      .data(conceptIds, d => d).join('g').attr('class', 'concept-node').style('display', 'none')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onConceptClick({
          conceptId: d, label: model.conceptLabels.get(d) ?? d, argCount: (model.conceptArgs.get(d) ?? []).length,
        })
      })
      .on('mouseenter', function (event, d) {
        applyConceptHighlight(d)
        d3.select(this).select('.concept-label').attr('opacity', 1)
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({
          type: 'concept', conceptId: d, label: model.conceptLabels.get(d) ?? d,
          argCount: (model.conceptArgs.get(d) ?? []).length, x: mx, y: my,
        })
      })
      .on('mouseleave', function (_, d) {
        applySticky()
        d3.select(this).select('.concept-label').attr('opacity', conceptLabelVisible.has(d) ? 1 : 0)
        optsRef.current.onHover?.(null)
      })
      .call(
        d3.drag<SVGGElement, string>()
          .on('start', (event) => {
            event.sourceEvent.stopPropagation()
            if (!event.active) sim.alphaTarget(0.2).restart()
          })
          .on('drag', (event, d) => {
            const center = { x: width / 2, y: height / 2 }
            conceptPinnedRef.current.set(d, Math.atan2(event.y - center.y, event.x - center.x))
          })
          .on('end', (event) => { if (!event.active) sim.alphaTarget(0) }),
      )
    conceptNodeGroups.each(function (d) {
      const g = d3.select(this); const S = 9
      g.append('polygon').attr('points', `0,${-S} ${S},0 0,${S} ${-S},0`).attr('fill', '#6366f1').attr('opacity', 0.85)
      g.append('text').attr('class', 'concept-label').attr('y', S + 8).attr('text-anchor', 'middle')
        .attr('pointer-events', 'none').attr('fill', '#6366f1').attr('font-size', '8px').attr('font-weight', '600')
        .attr('opacity', 0).text((model.conceptLabels.get(d) ?? '').slice(0, 18))
    })

    const conceptEdgeData = model.arguments
      .filter(a => model.argConcept.has(a.id))
      .map(a => ({ id: `cedge-${a.id}`, argId: a.id, conceptId: model.argConcept.get(a.id)! }))
    const conceptEdgeLines = conceptEdgeG.selectAll<SVGPathElement, typeof conceptEdgeData[number]>('path.concept-edge')
      .data(conceptEdgeData, d => d.id).join('path').attr('class', 'concept-edge')
      .attr('stroke', 'rgba(99,102,241,0.65)').attr('stroke-width', 2.5).attr('fill', 'none').style('display', 'none')

    // ── Highlight (hover + sticky) ──────────────────────────────────────────────
    const edgeEndId = (e: GraphEdge, w: 'source' | 'target') => {
      const v = e[w]
      return typeof v === 'string' ? v : (v as GraphNode).id
    }
    function applyConceptHighlight(cid: string) {
      const relatedArgs = new Set(model.conceptArgs.get(cid) ?? [])
      nodeGroups.attr('opacity', 0.12)
      edgeGroups.attr('opacity', 0.05)
      blobPaths.attr('opacity', d => relatedArgs.has(d.id) ? 1 : 0.12)
        .attr('stroke', BLOB_STROKE).attr('fill', BLOB_FILL)
      argNodeGroups.attr('opacity', d => relatedArgs.has(d.id) ? 1 : 0.12)
      conceptNodeGroups.attr('opacity', d => d === cid ? 1 : 0.12)
      conceptEdgeLines.attr('opacity', d => d.conceptId === cid ? 1 : 0.04)
    }
    function applyArgHighlight(aid: string) {
      const members = new Set(model.argMembers.get(aid) ?? [])
      const cid = model.argConcept.get(aid)
      nodeGroups.attr('opacity', d => members.has(d.id) ? 1 : 0.12)
      edgeGroups.attr('opacity', d =>
        members.has(edgeEndId(d, 'source')) && members.has(edgeEndId(d, 'target')) ? 1 : 0.05)
      blobPaths.attr('opacity', d => d.id === aid ? 1 : 0.12)
        .attr('stroke', d => d.id === aid ? BLOB_STROKE_SEL : BLOB_STROKE)
        .attr('fill', d => d.id === aid ? BLOB_FILL_SEL : BLOB_FILL)
      argNodeGroups.attr('opacity', d => d.id === aid ? 1 : 0.12)
      conceptNodeGroups.attr('opacity', d => d === cid ? 1 : 0.12)
      conceptEdgeLines.attr('opacity', d => d.argId === aid ? 1 : 0.04)
    }
    function clearHighlight() {
      nodeGroups.attr('opacity', null)
      edgeGroups.attr('opacity', null)
      argNodeGroups.attr('opacity', null)
      conceptNodeGroups.attr('opacity', null)
      conceptEdgeLines.attr('opacity', null)
      const sel = optsRef.current.selectedArgumentId
      blobPaths.attr('opacity', null)
        .attr('stroke', d => d.id === sel ? BLOB_STROKE_SEL : BLOB_STROKE)
        .attr('fill', d => d.id === sel ? BLOB_FILL_SEL : BLOB_FILL)
    }
    function applySticky() {
      const cId = optsRef.current.selectedConceptId
      const aId = optsRef.current.selectedArgumentId
      if (cId) applyConceptHighlight(cId)
      else if (aId) applyArgHighlight(aId)
      else clearHighlight()
    }
    highlightFnRef.current = applySticky

    // ── Label declutter (concepts) ──────────────────────────────────────────────
    // Argument text now lives inside the card itself, so only concept ring labels
    // need decluttering.
    const conceptLabelVisible = new Set<string>()
    const ringState = { cx: width / 2, cy: height / 2, r: 0 }
    let lastLabelK = -1
    let labelTick = 0
    function recomputeLabels() {
      const k = zoomKRef.current
      conceptLabelVisible.clear()
      const shownC: Array<{ x: number; y: number }> = []
      const gapC = 80 / k
      for (const [id, body] of [...conceptBodiesRef.current.entries()].sort((a, c) => a[0] < c[0] ? -1 : 1)) {
        const x = ringState.cx + Math.cos(body.angle) * ringState.r
        const y = ringState.cy + Math.sin(body.angle) * ringState.r
        if (shownC.every(p => Math.hypot(p.x - x, p.y - y) > gapC)) {
          conceptLabelVisible.add(id); shownC.push({ x, y })
        }
      }
    }
    function applyLabels() {
      conceptNodeGroups.each(function (d) {
        d3.select(this).select('.concept-label').attr('opacity', conceptLabelVisible.has(d) ? 1 : 0)
      })
    }

    // ── Simulation ──────────────────────────────────────────────────────────────
    const sim = d3.forceSimulation<GraphNode>(simNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges).id(d => d.id).strength(d => d.confidence * 0.4))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-220).theta(0.9))
      .force('collide', d3.forceCollide<GraphNode>(14).strength(0.7))
      .force('chainHome', chainHomeForce(model, centers, simNodes))
      .force('argLayout', argLayoutForce(model, simNodes))
      .force('bridge', bridgePullForce(model, simNodes))
      .force('blobRepel', blobRepulsionForce(model, simNodes))

    // ── Per-tick render ──────────────────────────────────────────────────────────
    const graphCenter = () => ({ x: width / 2, y: height / 2 })

    function drawChevron(
      sel: d3.Selection<SVGGElement, unknown, null, undefined>,
      x1: number, y1: number, x2: number, y2: number, id: string,
    ) {
      const shape = edgeShapeById.get(id)
      if (shape) positionEdgeShape(sel, shape, x1, y1, x2, y2)
    }

    // Persistent positions map (updated in place each frame — no per-frame alloc).
    const posMap = new Map<string, { x: number; y: number }>()
    let rafPending = false
    function scheduleRender() {
      if (rafPending) return
      rafPending = true
      requestAnimationFrame(() => { rafPending = false; renderFrame() })
    }

    function renderFrame() {
      if (!alive) return
      const k = zoomKRef.current
      const nodeScale = nodeScaleFor(k)
      const argumentsVisible = optsRef.current.filters.nodeTypes.Argument
      const entityVisible = optsRef.current.filters.nodeTypes.Entity
      const conceptVisible = optsRef.current.filters.nodeTypes.Concept
      // Blob shapes (and the zoom-collapse machinery) only make sense when both
      // arguments AND their member entities are on screen. With entities hidden,
      // every argument renders directly as a card instead.
      const showBlobs = argumentsVisible && entityVisible
      const center = graphCenter()

      for (const n of simNodes) {
        let p = posMap.get(n.id)
        if (!p) { p = { x: 0, y: 0 }; posMap.set(n.id, p) }
        p.x = n.x ?? 0; p.y = n.y ?? 0
      }

      const collapse = showBlobs
        ? computeCollapse(model, posMap, k, COLLAPSE_K)
        : {
          collapsedArgIds: new Set<string>(), hiddenEntityIds: new Set<string>(),
          argCentroids: new Map<string, { x: number; y: number }>(),
          resolveEndpoint: (id: string) => id,
          visibleEdges: [] as ReturnType<typeof computeCollapse>['visibleEdges'],
        }

      // Which arguments render as cards:
      //  • blob mode   → collapsed-by-zoom args plus always-node-only (0 members)
      //  • entities off → ALL arguments (their members aren't drawn, so a blob
      //                   would be empty) so arguments never disappear
      let nodeArgIds: Set<string>
      if (showBlobs) {
        nodeArgIds = new Set(collapse.collapsedArgIds)
        for (const id of nodeOnlyArgIds) nodeArgIds.add(id)
      } else if (argumentsVisible) {
        nodeArgIds = new Set(model.arguments.map(a => a.id))
      } else {
        nodeArgIds = new Set<string>()
      }

      // Entity nodes (hidden entirely when the Entity type is off)
      nodeGroups
        .style('display', d => (!entityVisible || collapse.hiddenEntityIds.has(d.id)) ? 'none' : null)
        .attr('transform', d => `translate(${d.x},${d.y})`)

      // Edges: entity-entity relations only show when entities are on screen.
      const resolvedById = new Map(collapse.visibleEdges.map(v => [v.edge.id, v]))
      const posOf = (id: string) =>
        posMap.get(id) ?? collapse.argCentroids.get(id) ?? argBodiesRef.current.get(id)
      edgeGroups.each(function (d) {
        const sel = d3.select(this)
        if (!entityVisible) { sel.style('display', 'none'); return }
        if (!showBlobs) {
          const s = d.source as GraphNode, t = d.target as GraphNode
          if (s.x == null || t.x == null) return
          drawChevron(sel, s.x!, s.y!, t.x!, t.y!, d.id)
          sel.style('display', null)
          return
        }
        const rv = resolvedById.get(d.id)
        if (!rv) { sel.style('display', 'none'); return }
        const sp = posOf(rv.sourceId), tp = posOf(rv.targetId)
        if (!sp || !tp) { sel.style('display', 'none'); return }
        sel.style('display', null)
        drawChevron(sel, sp.x, sp.y, tp.x, tp.y, d.id)
      })

      // Blobs (non-node arguments that still have members)
      if (showBlobs) {
        blobPaths.style('display', d => nodeArgIds.has(d.id) ? 'none' : null)
          .attr('d', d => {
            const pts = (model.argMembers.get(d.id) ?? [])
              .map(id => posMap.get(id))
              .filter((p): p is { x: number; y: number } => !!p)
              .map(p => [p.x, p.y] as [number, number])
            return computeBlobPath(pts) ?? ''
          })
      } else {
        blobPaths.style('display', 'none')
      }

      // Argument soft-body targets: every collapsed card flies OUT to its concept
      // wedge — angle from the deterministic layout, radius just beyond the entity
      // cloud. Grouping by concept is what keeps the concept→argument links from
      // crossing. New bodies are seeded at their entity centroid so they visibly
      // travel from the cluster to the wedge (the collapse reflow).
      const cloudR = ringRadius(posMap.values(), center, 0)
      const argRingR = cloudR + ARG_RING_MARGIN
      const memberCentroid = (id: string): { x: number; y: number } | null => {
        let sx = 0, sy = 0, cnt = 0
        for (const mid of model.argMembers.get(id) ?? []) {
          const p = posMap.get(mid)
          if (p) { sx += p.x; sy += p.y; cnt++ }
        }
        return cnt ? { x: sx / cnt, y: sy / cnt } : null
      }
      const argTargets = new Map<string, { x: number; y: number }>()
      for (const id of nodeArgIds) {
        const ang = wedge.argAngle.get(id) ?? 0
        argTargets.set(id, { x: center.x + Math.cos(ang) * argRingR, y: center.y + Math.sin(ang) * argRingR })
      }
      for (const id of nodeArgIds)
        if (!argBodiesRef.current.has(id)) {
          const seed = memberCentroid(id) ?? argTargets.get(id)!
          argBodiesRef.current.set(id, { id, x: seed.x, y: seed.y, vx: 0, vy: 0 })
        }
      for (const id of [...argBodiesRef.current.keys()])
        if (!nodeArgIds.has(id)) { argBodiesRef.current.delete(id); argPinnedRef.current.delete(id) }
      stepSoftBodies(argBodiesRef.current, {
        targets: argTargets, pinned: argPinnedRef.current, repelDist: ARG_REPEL, repelStrength: 0.5,
      })
      argNodeGroups
        .style('display', d => (argumentsVisible && nodeArgIds.has(d.id)) ? null : 'none')
        .attr('transform', d => {
          const b = argBodiesRef.current.get(d.id)
          return b ? `translate(${b.x},${b.y}) scale(${nodeScale})` : null
        })

      // Concept arcs sit on the outer ring, each pinned to its deterministic
      // sector centre (not chasing argument centroids). A concept is shown when
      // at least one of its arguments is currently a card. The ring sits beyond
      // the argument ring so links always travel inward.
      const radius = argRingR + CONCEPT_GAP
      ringState.cx = center.x; ringState.cy = center.y; ringState.r = radius
      const visibleConceptIds = new Set<string>()
      for (const [cid, argIds] of model.conceptArgs)
        if (argIds.some(a => nodeArgIds.has(a))) visibleConceptIds.add(cid)
      const targetAngles = wedge.conceptAngle
      for (const id of visibleConceptIds)
        if (!conceptBodiesRef.current.has(id))
          conceptBodiesRef.current.set(id, { id, angle: targetAngles.get(id) ?? 0, vAngle: 0 })
      for (const id of [...conceptBodiesRef.current.keys()])
        if (!visibleConceptIds.has(id)) { conceptBodiesRef.current.delete(id); conceptPinnedRef.current.delete(id) }
      stepRingBodies(conceptBodiesRef.current, targetAngles, conceptPinnedRef.current)

      const conceptPos = (id: string) => {
        const b = conceptBodiesRef.current.get(id)
        if (!b) return null
        return { x: center.x + Math.cos(b.angle) * radius, y: center.y + Math.sin(b.angle) * radius }
      }
      conceptNodeGroups
        .style('display', d => (argumentsVisible && conceptVisible && visibleConceptIds.has(d)) ? null : 'none')
        .attr('transform', d => {
          const p = conceptPos(d)
          return p ? `translate(${p.x},${p.y}) scale(${nodeScale})` : null
        })
      conceptEdgeLines
        .style('display', d => (argumentsVisible && conceptVisible
          && nodeArgIds.has(d.argId) && visibleConceptIds.has(d.conceptId)) ? null : 'none')
        .attr('d', d => {
          const cp = conceptPos(d.conceptId)
          const ap = argBodiesRef.current.get(d.argId)
          if (!cp || !ap) return ''
          return conceptLinkPath(cp.x, cp.y, ap.x, ap.y, center.x, center.y)
        })

      // Decluttered labels — recompute on zoom change or periodically (positions drift)
      labelTick++
      if (k !== lastLabelK || labelTick % 12 === 0) {
        lastLabelK = k
        recomputeLabels()
        applyLabels()
      }
    }
    sim.on('tick', renderFrame)

    const observer = new ResizeObserver(() => {
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      sim.alpha(0.1).restart()
      d3.select(svgEl).selectAll('.rings circle').attr('cx', w / 2).attr('cy', h / 2)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    simRef.current = sim
    return () => { alive = false; sim.stop(); observer.disconnect() }
  }, [nodes, edges, opts.filters])

  // ── Selection halo ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGGElement, GraphNode>('.nodes g').each(function (d) {
      const g = d3.select(this)
      g.select('.selection-halo').remove()
      if (d.id === optsRef.current.selectedNodeId) {
        g.insert('circle', ':first-child').attr('class', 'selection-halo')
          .attr('r', 14).attr('fill', 'none').attr('stroke', '#F4A124').attr('stroke-width', 2.5)
      }
    })
  }, [opts.selectedNodeId])

  // ── showBlobs / blob list change → reheat ──────────────────────────────────────
  useEffect(() => { simRef.current?.alpha(0.3).restart() }, [opts.showBlobs, opts.blobs])

  // ── Sticky highlight (selection-driven) ─────────────────────────────────────────
  useEffect(() => { highlightFnRef.current() }, [opts.selectedArgumentId, opts.selectedConceptId])

  const reheat = () => simRef.current?.alpha(0.5).restart()
  const freeze = () => simRef.current?.stop()
  return { reheat, freeze }
}
