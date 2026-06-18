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

const ENTITY_R = 8
// Zoom hard-locks at LOCK_K. Up to there the wheel zooms normally; once locked,
// further scroll-out drives a separate collapse progress (0→1) that collapses
// arguments to cards smallest-first, and scroll-in reverses it before zooming
// back in. So past the lock the scroll controls collapse directly, not zoom.
const LOCK_K = 0.45
const ZOOM_MAX = 4
const COLLAPSE_WHEEL_STEP = 0.0016   // collapse progress per wheel-pixel past the lock

// Argument card (blob-style rounded rectangle holding the argument text)
const ARG_CARD_W = 96         // graph units
const ARG_CARD_H = 34
const ARG_CARD_RX = 9
const ARG_TEXT_CHARS = 16     // chars per wrapped line
const ARG_TEXT_LINES = 2      // max lines of argument text shown inside the card
const ARG_LINE_H = 8          // line height, graph units
const ARG_SEP_STRENGTH = 1.0  // how hard overlapping argument cards push apart
const ARG_SEP_MARGIN = 16     // extra gap between cards, graph units

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

// Argument cards counteract zoom-out so their text stays readable: scale ≈ 1/k
// keeps a card roughly constant on-screen size as you zoom out, up to a cap.
const MAX_NODE_SCALE = 5
const nodeScaleFor = (k: number) => Math.min(MAX_NODE_SCALE, Math.max(1, 1 / Math.max(k, 1e-3)))

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
  hoveredConceptId: string | null
  onNodeClick: (node: GraphNode) => void
  onBlobClick: (blob: ArgumentBlob) => void
  onConceptClick: (payload: ConceptClickPayload) => void
  onEdgeClick?: (edge: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode) => void
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
  const collapseRef = useRef(0)   // 0→1 collapse progress, driven by scroll past the lock
  const highlightFnRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.style('background', '#fafbfc')
    let alive = true

    svg.on('click', () => optsRef.current.onCanvasClick?.())

    // ── Model ────────────────────────────────────────────────────────────────
    const { minConfidence, relationTypes } = optsRef.current.filters
    const fEdges = edges.filter(e =>
      e.confidence >= minConfidence && relationTypes[e.relation_type] !== false)
    const model = buildGraphModel(nodes, fEdges, optsRef.current.blobs)
    // Largest argument (by member count) — collapse progress is normalised to it
    // so progress = 1 collapses everything.
    const maxMembers = Math.max(1, ...model.arguments.map(a => model.argMembers.get(a.id)?.length ?? 0))

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
    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')
    const argNodeG = zoomG.append('g').attr('class', 'arg-nodes')
    const partG = zoomG.append('g').attr('class', 'particles').attr('pointer-events', 'none')

    // ── Zoom ─────────────────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([LOCK_K, ZOOM_MAX])
      // We drive the wheel ourselves (below) so it can switch between zooming and
      // collapsing; d3 keeps handling drag-pan and double-click.
      .filter((e: Event) => e.type !== 'wheel' && !(e as MouseEvent).ctrlKey && !(e as MouseEvent).button)
      .on('zoom', (e) => {
        zoomG.attr('transform', e.transform)
        zoomKRef.current = e.transform.k
        scheduleRender()   // recompute LOD live during zoom, even when the sim is idle
      })
    svg.call(zoom)

    // Wheel: zoom until the lock, then the SAME scroll drives collapse progress.
    let collapseCool: ReturnType<typeof setTimeout> | undefined
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const out = e.deltaY > 0
      const atLock = zoomKRef.current <= LOCK_K + 1e-4
      if ((atLock && out) || (collapseRef.current > 0 && !out)) {
        const step = Math.min(0.2, Math.abs(e.deltaY) * (e.deltaMode === 1 ? 0.03 : COLLAPSE_WHEEL_STEP))
        collapseRef.current = Math.max(0, Math.min(1, collapseRef.current + (out ? step : -step)))
        // Reheat so the (alpha-scaled) separation force actively pushes the newly
        // collapsed cards apart; cool back down shortly after scrolling stops.
        sim.alphaTarget(0.3).restart()
        clearTimeout(collapseCool)
        collapseCool = setTimeout(() => sim.alphaTarget(0), 300)
        scheduleRender()
      } else {
        zoom.scaleBy(svg, Math.pow(2, -e.deltaY * 0.002), d3.pointer(e, svgEl))
      }
    }
    svgEl.addEventListener('wheel', onWheel, { passive: false })

    // ── Collapse hint ─────────────────────────────────────────────────────────
    // Screen-fixed pill (NOT in zoomG) that appears once zoom is locked, telling
    // the user that scrolling further collapses arguments; its bar tracks progress.
    const HINT_W = 244, HINT_H = 40, HINT_PROG_W = HINT_W - 40
    const hintG = svg.append('g').attr('class', 'collapse-hint').attr('pointer-events', 'none')
      .attr('transform', `translate(${width / 2}, ${height - 34})`)
      .style('opacity', 0).style('transition', 'opacity 180ms')
    hintG.append('rect').attr('x', -HINT_W / 2).attr('y', -HINT_H / 2).attr('width', HINT_W).attr('height', HINT_H)
      .attr('rx', HINT_H / 2).attr('fill', 'rgba(7,59,76,0.92)')
    hintG.append('text').attr('class', 'hint-label').attr('text-anchor', 'middle').attr('y', -3)
      .attr('fill', '#fff').attr('font-size', '12px').attr('font-weight', '600')
    hintG.append('rect').attr('x', -HINT_PROG_W / 2).attr('y', 8).attr('width', HINT_PROG_W).attr('height', 4)
      .attr('rx', 2).attr('fill', 'rgba(255,255,255,0.22)')
    const hintFill = hintG.append('rect').attr('x', -HINT_PROG_W / 2).attr('y', 8).attr('width', 0).attr('height', 4)
      .attr('rx', 2).attr('fill', '#F4A124')

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
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onEdgeClick?.(d, d.source as GraphNode, d.target as GraphNode)
      })

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

    // Drag that moves an argument's member entities (used by BOTH the blob and the
    // collapsed card). Because the card is drawn at its members' centroid, moving
    // the members is what moves the card — content and card stay locked together.
    function memberDrag<E extends Element>() {
      let members: { node: GraphNode; relX: number; relY: number }[] = []
      let cx = 0, cy = 0, sx = 0, sy = 0
      return d3.drag<E, ArgumentBlob>()
        .on('start', (event, d) => {
          event.sourceEvent.stopPropagation()
          if (!event.active) sim.alphaTarget(0.3).restart()
          sx = event.x; sy = event.y
          const ms = (model.argMembers.get(d.id) ?? [])
            .map(id => simNodes.find(n => n.id === id)).filter((n): n is GraphNode => !!n)
          cx = ms.reduce((s, n) => s + (n.x ?? 0), 0) / (ms.length || 1)
          cy = ms.reduce((s, n) => s + (n.y ?? 0), 0) / (ms.length || 1)
          members = ms.map(n => ({ node: n, relX: (n.x ?? 0) - cx, relY: (n.y ?? 0) - cy }))
          members.forEach(({ node }) => { node.fx = node.x; node.fy = node.y })
        })
        .on('drag', (event) => {
          const ncx = cx + (event.x - sx), ncy = cy + (event.y - sy)
          members.forEach(({ node, relX, relY }) => { node.fx = ncx + relX; node.fy = ncy + relY })
        })
        .on('end', (event) => {
          if (!event.active) sim.alphaTarget(0)
          members.forEach(({ node }) => { node.fx = null; node.fy = null; node.vx = 0; node.vy = 0 })
          members = []
        })
    }
    blobPaths.call(memberDrag<SVGPathElement>())

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
      .call(memberDrag<SVGGElement>())
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

    // ── Highlight (hover + sticky) ──────────────────────────────────────────────
    const edgeEndId = (e: GraphEdge, w: 'source' | 'target') => {
      const v = e[w]
      return typeof v === 'string' ? v : (v as GraphNode).id
    }
    function applyArgHighlight(aid: string) {
      const members = new Set(model.argMembers.get(aid) ?? [])
      nodeGroups.attr('opacity', d => members.has(d.id) ? 1 : 0.12)
      edgeGroups.attr('opacity', d =>
        members.has(edgeEndId(d, 'source')) && members.has(edgeEndId(d, 'target')) ? 1 : 0.05)
      blobPaths.attr('opacity', d => d.id === aid ? 1 : 0.12)
        .attr('stroke', d => d.id === aid ? BLOB_STROKE_SEL : BLOB_STROKE)
        .attr('fill', d => d.id === aid ? BLOB_FILL_SEL : BLOB_FILL)
      argNodeGroups.attr('opacity', d => d.id === aid ? 1 : 0.12)
    }
    function applyConceptHighlight(conceptId: string) {
      const label = conceptId.replace(/^concept-/, '')
      const argIds = new Set(
        optsRef.current.blobs.filter(b => b.parent_concepts.includes(label)).map(b => b.id)
      )
      const allMembers = new Set([...argIds].flatMap(aid => model.argMembers.get(aid) ?? []))
      nodeGroups.attr('opacity', d => allMembers.has(d.id) ? 1 : 0.12)
      edgeGroups.attr('opacity', d =>
        allMembers.has(edgeEndId(d, 'source')) && allMembers.has(edgeEndId(d, 'target')) ? 1 : 0.05)
      blobPaths.attr('opacity', d => argIds.has(d.id) ? 1 : 0.12)
        .attr('stroke', d => argIds.has(d.id) ? BLOB_STROKE_SEL : BLOB_STROKE)
        .attr('fill', d => argIds.has(d.id) ? BLOB_FILL_SEL : BLOB_FILL)
      argNodeGroups.attr('opacity', d => argIds.has(d.id) ? 1 : 0.12)
    }
    function clearHighlight() {
      nodeGroups.attr('opacity', null)
      edgeGroups.attr('opacity', null)
      argNodeGroups.attr('opacity', null)
      const sel = optsRef.current.selectedArgumentId
      blobPaths.attr('opacity', null)
        .attr('stroke', d => d.id === sel ? BLOB_STROKE_SEL : BLOB_STROKE)
        .attr('fill', d => d.id === sel ? BLOB_FILL_SEL : BLOB_FILL)
    }
    function applySticky() {
      const aId = optsRef.current.selectedArgumentId
      const hcId = optsRef.current.hoveredConceptId
      if (aId) applyArgHighlight(aId)
      else if (hcId) applyConceptHighlight(hcId)
      else clearHighlight()
    }
    highlightFnRef.current = applySticky

    // ── Simulation ──────────────────────────────────────────────────────────────
    // Links WITHIN an argument keep its entities cohesive (strong); links BETWEEN
    // arguments (no shared argument) are kept weak so cross-argument relations
    // don't drag the clusters together and fight the separation.
    const INTRA_ARG_LINK = 0.4, INTER_ARG_LINK = 0.04
    const edgeEndIdOf = (v: string | GraphNode) => typeof v === 'string' ? v : v.id
    const linkStrength = new Map<string, number>()
    for (const e of simEdges) {
      const as = model.entityArgs.get(edgeEndIdOf(e.source)) ?? []
      const at = model.entityArgs.get(edgeEndIdOf(e.target)) ?? []
      const intra = as.some(a => at.includes(a))
      linkStrength.set(e.id, e.confidence * (intra ? INTRA_ARG_LINK : INTER_ARG_LINK))
    }
    // Argument-NODE separation: treat each argument as its CARD rectangle (centred
    // on its members' centroid) and push OVERLAPPING cards apart by nudging their
    // member entities — so argument cards/blobs never overlap. Rectangular AABB
    // (cards are wide, not points), every pair, scaled to the live card size. A
    // shared entity sits between both cards (its opposing pushes cancel).
    const sepById = new Map(simNodes.map(n => [n.id, n]))
    const argSeparation = (alpha: number) => {
      const s = nodeScaleFor(zoomKRef.current)
      const needX = (ARG_CARD_W + ARG_SEP_MARGIN) * s, needY = (ARG_CARD_H + ARG_SEP_MARGIN) * s
      const cents: { mem: string[]; x: number; y: number }[] = []
      for (const arg of model.arguments) {
        const mem = model.argMembers.get(arg.id) ?? []
        let sx = 0, sy = 0, cnt = 0
        for (const id of mem) { const n = sepById.get(id); if (n) { sx += n.x ?? 0; sy += n.y ?? 0; cnt++ } }
        if (cnt) cents.push({ mem, x: sx / cnt, y: sy / cnt })
      }
      const f = ARG_SEP_STRENGTH * alpha * 0.5
      for (let i = 0; i < cents.length; i++) {
        for (let j = i + 1; j < cents.length; j++) {
          const A = cents[i], B = cents[j]
          const dx = B.x - A.x, dy = B.y - A.y
          const ox = needX - Math.abs(dx), oy = needY - Math.abs(dy)
          if (ox <= 0 || oy <= 0) continue   // rectangles already clear
          // Resolve along the axis of least overlap (true rectangle separation).
          let pvx = 0, pvy = 0
          if (ox <= oy) pvx = (dx < 0 ? -ox : ox)
          else pvy = (dy < 0 ? -oy : oy)
          for (const id of A.mem) { const n = sepById.get(id); if (n) { n.vx = (n.vx ?? 0) - pvx * f; n.vy = (n.vy ?? 0) - pvy * f } }
          for (const id of B.mem) { const n = sepById.get(id); if (n) { n.vx = (n.vx ?? 0) + pvx * f; n.vy = (n.vy ?? 0) + pvy * f } }
        }
      }
    }
    const sim = d3.forceSimulation<GraphNode>(simNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges).id(d => d.id)
        .strength(d => linkStrength.get(d.id) ?? d.confidence * INTER_ARG_LINK))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-220).theta(0.9))
      .force('collide', d3.forceCollide<GraphNode>(14).strength(0.7))
      .force('argLayout', argLayoutForce(model, simNodes))
      .force('bridge', bridgePullForce(model, simNodes))
      .force('chainHome', chainHomeForce(model, centers, simNodes))
      .force('blobRepel', blobRepulsionForce(model, simNodes))
      .force('argSep', argSeparation)

    // ── Per-tick render ──────────────────────────────────────────────────────────
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

    // ── Transition particles ──────────────────────────────────────────────────
    // Fired on the blob↔card transition: filled bursts (collapse) and expanding
    // stroke-only rings (entities reappearing on expand).
    interface Particle { el: SVGCircleElement; active: boolean; ring: boolean; x0: number; y0: number; vx: number; vy: number; born: number; life: number; r0: number; rEnd: number; maxOp: number }
    const particles: Particle[] = []
    let particleRaf = 0
    function takeParticle(): Particle {
      let p = particles.find(q => !q.active)
      if (!p) {
        p = { el: partG.append('circle').node() as SVGCircleElement, active: false, ring: false, x0: 0, y0: 0, vx: 0, vy: 0, born: 0, life: 0, r0: 0, rEnd: 0, maxOp: 1 }
        particles.push(p)
      }
      return p
    }
    interface BurstOpts { color: string; n: number; spd: number; scale: number; maxOp?: number; r?: number; rect?: { w: number; h: number } }
    function spawnBurst(cx: number, cy: number, o: BurstOpts) {
      const maxOp = o.maxOp ?? 0.7, r0 = (o.r ?? 2.4) * o.scale
      for (let i = 0; i < o.n; i++) {
        const p = takeParticle()
        const a = (i / o.n) * Math.PI * 2 + Math.random() * 0.5
        const cos = Math.cos(a), sin = Math.sin(a)
        // For arguments, start each particle ON the card's rounded-rect edge (not
        // the centre); otherwise start at the point itself.
        let ox = 0, oy = 0
        if (o.rect) {
          const t = Math.min((o.rect.w * o.scale / 2) / (Math.abs(cos) || 1e-3), (o.rect.h * o.scale / 2) / (Math.abs(sin) || 1e-3))
          ox = cos * t; oy = sin * t
        }
        const v = o.spd * o.scale * (0.6 + Math.random() * 0.6)
        p.active = true; p.ring = false; p.x0 = cx + ox; p.y0 = cy + oy; p.vx = cos * v; p.vy = sin * v
        p.born = performance.now(); p.life = 360 + Math.random() * 200; p.r0 = r0; p.maxOp = maxOp
        p.el.setAttribute('fill', o.color); p.el.setAttribute('stroke', 'none')
      }
      if (!particleRaf) particleRaf = requestAnimationFrame(stepParticles)
    }
    // A single expanding, stroke-only ring (radar-ping) — used per entity as it
    // reappears on expand.
    function spawnRipple(cx: number, cy: number, color: string, scale: number, maxOp = 0.3) {
      const p = takeParticle()
      p.active = true; p.ring = true; p.x0 = cx; p.y0 = cy; p.vx = 0; p.vy = 0
      p.born = performance.now(); p.life = 620
      p.r0 = ENTITY_R * scale * 0.6; p.rEnd = ENTITY_R * scale * 4.5; p.maxOp = maxOp
      p.el.setAttribute('fill', 'none')
      p.el.setAttribute('stroke', color)
      p.el.setAttribute('stroke-width', String(1.4 * scale))
      p.el.setAttribute('cx', String(cx)); p.el.setAttribute('cy', String(cy))
      if (!particleRaf) particleRaf = requestAnimationFrame(stepParticles)
    }
    function stepParticles(now: number) {
      let any = false
      for (const p of particles) {
        if (!p.active) continue
        const t = (now - p.born) / p.life
        if (t >= 1) { p.active = false; p.el.setAttribute('opacity', '0'); continue }
        any = true
        if (p.ring) {
          p.el.setAttribute('r', String(p.r0 + (p.rEnd - p.r0) * t))
          p.el.setAttribute('opacity', String((1 - t) * p.maxOp))
        } else {
          const e = (p.life / 1000) * t
          p.el.setAttribute('cx', String(p.x0 + p.vx * e))
          p.el.setAttribute('cy', String(p.y0 + p.vy * e))
          p.el.setAttribute('r', String(p.r0 * (1 - 0.5 * t)))
          p.el.setAttribute('opacity', String((1 - t) * p.maxOp))
        }
      }
      particleRaf = any ? requestAnimationFrame(stepParticles) : 0
    }

    // Track which arguments were cards last frame, to fire transition pops.
    let prevNodeArgIds = new Set<string>()

    function renderFrame() {
      if (!alive) return
      const k = zoomKRef.current
      const nodeScale = nodeScaleFor(k)
      const argumentsVisible = optsRef.current.filters.nodeTypes.Argument
      const entityVisible = optsRef.current.filters.nodeTypes.Entity
      // Blob shapes (and the zoom-collapse machinery) only make sense when both
      // arguments AND their member entities are on screen. With entities hidden,
      // every argument renders directly as a card instead.
      const showBlobs = argumentsVisible && entityVisible

      for (const n of simNodes) {
        let p = posMap.get(n.id)
        if (!p) { p = { x: 0, y: 0 }; posMap.set(n.id, p) }
        p.x = n.x ?? 0; p.y = n.y ?? 0
      }

      // Collapse progress (0→1, scroll-driven past the lock) collapses arguments
      // smallest-first: an argument with √count ≤ progress·√maxCount is a card.
      const collapseC = collapseRef.current
      const collapseEdge = collapseC * Math.sqrt(maxMembers)

      // Collapse hint: visible once locked or mid-collapse; bar tracks progress,
      // label shows the current size threshold (args with ≤ N entities collapse).
      const atLock = k <= LOCK_K + 1e-4
      const showHint = showBlobs && (atLock || collapseC > 0.001)
      hintG.style('opacity', showHint ? 1 : 0)
      if (showHint) {
        hintFill.attr('width', HINT_PROG_W * collapseC)
        const threshN = Math.floor(collapseEdge * collapseEdge)
        const label = collapseC >= 0.999 ? `All arguments collapsed (≤ ${maxMembers})`
          : threshN >= 1 ? `Collapsing arguments ≤ ${threshN} ${threshN === 1 ? 'entity' : 'entities'}`
            : 'Scroll to collapse arguments'
        hintG.select('.hint-label').text(label)
      }
      const collapse = showBlobs
        ? computeCollapse(model, posMap, count => Math.sqrt(count) <= collapseEdge)
        : {
          collapsedArgIds: new Set<string>(), hiddenEntityIds: new Set<string>(),
          argCentroids: new Map<string, { x: number; y: number }>(),
          resolveEndpoint: (id: string) => id,
          visibleEdges: [] as ReturnType<typeof computeCollapse>['visibleEdges'],
        }

      // Which arguments render as cards (only ones that have members — a card with
      // no entities has no centroid to sit on, so it's not shown in this view):
      //  • blob mode    → arguments collapsed by zoom
      //  • entities off → every argument with members
      const hasMembers = (id: string) => (model.argMembers.get(id)?.length ?? 0) > 0
      let nodeArgIds: Set<string>
      if (showBlobs) {
        nodeArgIds = new Set(collapse.collapsedArgIds)
      } else if (argumentsVisible) {
        nodeArgIds = new Set(model.arguments.filter(a => hasMembers(a.id)).map(a => a.id))
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
        posMap.get(id) ?? collapse.argCentroids.get(id)
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

      // Collapsed argument cards sit exactly on the live centroid of their member
      // entities — they do NOT travel anywhere. The card simply replaces the blob
      // in place; dragging the card moves the members (and thus the centroid).
      const memberCentroid = (id: string): { x: number; y: number } | null => {
        let sx = 0, sy = 0, cnt = 0
        for (const mid of model.argMembers.get(id) ?? []) {
          const p = posMap.get(mid)
          if (p) { sx += p.x; sy += p.y; cnt++ }
        }
        return cnt ? { x: sx / cnt, y: sy / cnt } : null
      }
      argNodeGroups
        .style('display', d => (argumentsVisible && nodeArgIds.has(d.id) && memberCentroid(d.id)) ? null : 'none')
        .attr('transform', d => {
          const c = memberCentroid(d.id)
          return c ? `translate(${c.x},${c.y}) scale(${nodeScale})` : null
        })

      // Particle pops on the blob↔card transition. Collapse → a burst along the
      // new card's edge. Expand → a tiny, very faint pop at each entity as it
      // reappears, staggered.
      for (const id of nodeArgIds)
        if (!prevNodeArgIds.has(id)) {
          const c = memberCentroid(id)
          if (c) spawnBurst(c.x, c.y, { color: 'rgba(7,59,76,0.7)', n: 10, spd: 34, scale: nodeScale, maxOp: 0.6, r: 2.2, rect: { w: ARG_CARD_W, h: ARG_CARD_H } })
        }
      for (const id of prevNodeArgIds)
        if (!nodeArgIds.has(id)) {
          (model.argMembers.get(id) ?? []).forEach((mid, i) => {
            const p = posMap.get(mid)
            if (!p) return
            const px = p.x, py = p.y
            setTimeout(() => {
              if (alive) spawnRipple(px, py, '#118ab2', nodeScaleFor(zoomKRef.current), 0.3)
            }, i * 110)
          })
        }
      prevNodeArgIds = new Set(nodeArgIds)
    }
    sim.on('tick', renderFrame)

    const observer = new ResizeObserver(() => {
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      sim.alpha(0.1).restart()
      d3.select(svgEl).selectAll('.rings circle').attr('cx', w / 2).attr('cy', h / 2)
      hintG.attr('transform', `translate(${w / 2}, ${h - 34})`)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    simRef.current = sim
    return () => { alive = false; sim.stop(); observer.disconnect(); svgEl.removeEventListener('wheel', onWheel); clearTimeout(collapseCool); if (particleRaf) cancelAnimationFrame(particleRaf) }
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
  useEffect(() => { highlightFnRef.current() }, [opts.selectedArgumentId, opts.selectedConceptId, opts.hoveredConceptId])

  const reheat = () => simRef.current?.alpha(0.5).restart()
  const freeze = () => simRef.current?.stop()
  return { reheat, freeze }
}
