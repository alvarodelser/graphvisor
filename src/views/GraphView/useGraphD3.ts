import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState, ArgumentBlob } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'
import { buildGraphModel } from '../../graph/graphModel'
import { computeBlobPath } from '../../graph/blobGeometry'
import {
  computeChainCenters, chainHomeForce, argLayoutForce, bridgePullForce, blobRepulsionForce,
} from '../../graph/forces'
import { computeCollapse } from '../../graph/collapse'
import {
  ringRadius, computeConceptTargets, stepRingBodies, spiralPath, type RingBody,
} from '../../graph/conceptOrbit'
import { stepSoftBodies, type SoftBody } from '../../graph/softBodies'

// ── Chevron geometry (unchanged style) ─────────────────────────────────────────
const CHEV_HALF_H = 6
const CHEV_TIP_OFFSET = 8
const CHEV_SPACING = 20
const CHEV_TIP_REACH = 8
const CHEV_COUNT = 28
const CHEV_START = -28

const ENTITY_R = 8
const ARG_NODE_R = 8          // collapsed argument node radius, graph units (= entity size)
const COLLAPSE_PX = 70
const ORBIT_MARGIN = 160

interface HoverPayload { type: 'node'; node: GraphNode; x: number; y: number }
interface EdgeHoverPayload { type: 'edge'; edge: GraphEdge; sourceNode: GraphNode; targetNode: GraphNode; x: number; y: number }
interface BlobHoverPayload { type: 'blob'; blob: ArgumentBlob; x: number; y: number }
export type HoverItem = HoverPayload | EdgeHoverPayload | BlobHoverPayload | null

interface Options {
  filters: FilterState
  selectedNodeId: string | null
  blobs: ArgumentBlob[]
  showBlobs: boolean
  selectedArgumentId: string | null
  onNodeClick: (node: GraphNode) => void
  onBlobClick: (blob: ArgumentBlob) => void
  onHover?: (item: HoverItem) => void
  onCanvasClick?: () => void
}

function chevronOuterPoints(len: number): string {
  const bodyEnd = Math.max(0, len - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${len},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}
function edgeStroke(group: string): string {
  return group === 'structural' ? '#64748b' : RELATION_COLORS[group]
}
function edgeFill(group: string): string {
  return group === 'structural' ? 'none' : `${RELATION_COLORS[group]}0f`
}

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
    const { minConfidence, relationTypes, nodeTypes } = optsRef.current.filters
    const fEdges = edges.filter(e =>
      e.confidence >= minConfidence && relationTypes[e.relation_type] !== false)
    const model = buildGraphModel(nodes, fEdges, optsRef.current.blobs)

    const simNodes: GraphNode[] = model.entities
      .filter(() => nodeTypes.Entity)
      .map(n => ({ ...n }))
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
    const conceptEdgeG = zoomG.append('g').attr('class', 'concept-edges')
    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')
    const argNodeG = zoomG.append('g').attr('class', 'arg-nodes')
    const conceptNodeG = zoomG.append('g').attr('class', 'concept-nodes')

    // ── Zoom ─────────────────────────────────────────────────────────────────
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (e) => { zoomG.attr('transform', e.transform); zoomKRef.current = e.transform.k })
    svg.call(zoom)

    // ── Edge groups (chevron style) ───────────────────────────────────────────
    const edgeGroups = edgeG.selectAll<SVGGElement, GraphEdge>('g.edge-group')
      .data(simEdges, d => d.id).join('g').attr('class', 'edge-group').style('cursor', 'pointer')
    edgeGroups.each(function (d) {
      const g = d3.select(this)
      defs.append('clipPath').attr('id', `edgeclip-${d.id}`).attr('clipPathUnits', 'userSpaceOnUse')
        .append('polygon').attr('points', chevronOuterPoints(0))
      g.append('polygon').attr('class', 'chevron-outer')
        .attr('fill', edgeFill(d.group)).attr('stroke', edgeStroke(d.group))
        .attr('stroke-width', 1).attr('stroke-linejoin', 'miter').attr('opacity', 0.85)
      const inner = g.append('g').attr('clip-path', `url(#edgeclip-${d.id})`).append('g')
      for (let i = 0; i < CHEV_COUNT; i++) {
        const bx = CHEV_START + i * CHEV_SPACING
        inner.append('polyline')
          .attr('points', `${bx},${-CHEV_HALF_H} ${bx + CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`)
          .attr('fill', 'none').attr('stroke', RELATION_COLORS[d.group])
          .attr('stroke-width', 3).attr('opacity', 0.65)
      }
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
      .attr('fill', 'rgba(100,116,139,0.04)').attr('stroke', 'rgba(100,116,139,0.12)')
      .attr('stroke-width', 1.5).attr('pointer-events', 'fill').style('cursor', 'pointer')
      .on('click', (event, d) => { event.stopPropagation(); optsRef.current.onBlobClick(d) })
      .on('mouseenter', function (event, d) {
        d3.select(this).attr('stroke', 'rgba(100,116,139,0.45)').attr('fill', 'rgba(100,116,139,0.13)')
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'blob', blob: d, x: mx, y: my })
      })
      .on('mouseleave', function (_, d) {
        const sel = optsRef.current.selectedArgumentId === d.id
        d3.select(this)
          .attr('stroke', sel ? 'rgba(100,116,139,0.6)' : 'rgba(100,116,139,0.12)')
          .attr('fill', sel ? 'rgba(100,116,139,0.13)' : 'rgba(100,116,139,0.04)')
        optsRef.current.onHover?.(null)
      })

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
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'blob', blob: d, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))
      .call(
        d3.drag<SVGGElement, ArgumentBlob>()
          .on('start', (event) => event.sourceEvent.stopPropagation())
          .on('drag', (event, d) => { argPinnedRef.current.set(d.id, { x: event.x, y: event.y }) })
          .on('end', () => {/* stays pinned */}),
      )
    argNodeGroups.each(function (d) {
      const g = d3.select(this)
      g.append('rect').attr('x', -ARG_NODE_R).attr('y', -ARG_NODE_R)
        .attr('width', ARG_NODE_R * 2).attr('height', ARG_NODE_R * 2).attr('rx', 3)
        .attr('fill', 'rgba(7,59,76,0.22)').attr('stroke', 'rgba(7,59,76,0.4)').attr('stroke-width', 1)
      g.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
        .attr('pointer-events', 'none').attr('fill', 'rgba(7,59,76,0.6)')
        .attr('font-size', '9px').attr('font-weight', '700').text(d.argument_type.slice(0, 1).toUpperCase())
      g.append('title').text(d.argument_type)
    })

    // ── Concept nodes ───────────────────────────────────────────────────────────
    const conceptIds = [...model.conceptArgs.keys()]
    const conceptNodeGroups = conceptNodeG.selectAll<SVGGElement, string>('g.concept-node')
      .data(conceptIds, d => d).join('g').attr('class', 'concept-node').style('display', 'none')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, string>()
          .on('start', (event) => event.sourceEvent.stopPropagation())
          .on('drag', (event, d) => {
            const center = { x: width / 2, y: height / 2 }
            conceptPinnedRef.current.set(d, Math.atan2(event.y - center.y, event.x - center.x))
          })
          .on('end', () => {/* stays pinned */}),
      )
    conceptNodeGroups.each(function (d) {
      const g = d3.select(this); const S = 9
      g.append('polygon').attr('points', `0,${-S} ${S},0 0,${S} ${-S},0`).attr('fill', '#6366f1').attr('opacity', 0.85)
      g.append('text').attr('y', S + 8).attr('text-anchor', 'middle').attr('pointer-events', 'none')
        .attr('fill', '#6366f1').attr('font-size', '8px').attr('font-weight', '600')
        .text((model.conceptLabels.get(d) ?? '').slice(0, 18))
    })

    const conceptEdgeData = model.arguments
      .filter(a => model.argConcept.has(a.id))
      .map(a => ({ id: `cedge-${a.id}`, argId: a.id, conceptId: model.argConcept.get(a.id)! }))
    const conceptEdgeLines = conceptEdgeG.selectAll<SVGPathElement, typeof conceptEdgeData[number]>('path.concept-edge')
      .data(conceptEdgeData, d => d.id).join('path').attr('class', 'concept-edge')
      .attr('stroke', 'rgba(99,102,241,0.65)').attr('stroke-width', 2.5).attr('fill', 'none').style('display', 'none')

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
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI)
      sel.attr('transform', `translate(${x1},${y1}) rotate(${angle})`)
      const pts = chevronOuterPoints(len)
      sel.select('.chevron-outer').attr('points', pts)
      d3.select(`#edgeclip-${id} polygon`).attr('points', pts)
    }

    sim.on('tick', () => {
      if (!alive) return
      const k = zoomKRef.current
      const showBlobs = optsRef.current.showBlobs
      const entityVisible = optsRef.current.filters.nodeTypes.Entity
      const conceptVisible = optsRef.current.filters.nodeTypes.Concept

      const positions = new Map(simNodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))

      const collapse = showBlobs
        ? computeCollapse(model, positions, k, COLLAPSE_PX)
        : {
          collapsedArgIds: new Set<string>(), hiddenEntityIds: new Set<string>(),
          argCentroids: new Map<string, { x: number; y: number }>(),
          resolveEndpoint: (id: string) => id,
          visibleEdges: [] as ReturnType<typeof computeCollapse>['visibleEdges'],
        }

      // Entity nodes
      nodeGroups
        .style('display', d => collapse.hiddenEntityIds.has(d.id) ? 'none' : null)
        .attr('transform', d => `translate(${d.x},${d.y})`)

      // Edges: position visible (resolved) ones, hide the rest
      const resolvedById = new Map(collapse.visibleEdges.map(v => [v.edge.id, v]))
      const posOf = (id: string) =>
        positions.get(id) ?? collapse.argCentroids.get(id) ?? argBodiesRef.current.get(id)
      edgeGroups.each(function (d) {
        const sel = d3.select(this)
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

      // Blobs (expanded only)
      if (showBlobs) {
        blobPaths.style('display', d => collapse.collapsedArgIds.has(d.id) ? 'none' : null)
          .attr('d', d => {
            const pts = (model.argMembers.get(d.id) ?? [])
              .map(id => positions.get(id))
              .filter((p): p is { x: number; y: number } => !!p)
              .map(p => [p.x, p.y] as [number, number])
            return computeBlobPath(pts) ?? ''
          })
      } else {
        blobPaths.style('display', 'none')
      }

      // Argument soft-body nodes (collapsed)
      const argTargets = new Map<string, { x: number; y: number }>()
      for (const id of collapse.collapsedArgIds) argTargets.set(id, collapse.argCentroids.get(id)!)
      for (const id of collapse.collapsedArgIds)
        if (!argBodiesRef.current.has(id)) {
          const c = collapse.argCentroids.get(id)!
          argBodiesRef.current.set(id, { id, x: c.x, y: c.y, vx: 0, vy: 0 })
        }
      for (const id of [...argBodiesRef.current.keys()])
        if (!collapse.collapsedArgIds.has(id)) { argBodiesRef.current.delete(id); argPinnedRef.current.delete(id) }
      stepSoftBodies(argBodiesRef.current, {
        targets: argTargets, pinned: argPinnedRef.current, repelDist: 26, repelStrength: 0.5,
      })
      argNodeGroups
        .style('display', d => (showBlobs && entityVisible && collapse.collapsedArgIds.has(d.id)) ? null : 'none')
        .attr('transform', d => {
          const b = argBodiesRef.current.get(d.id)
          return b ? `translate(${b.x},${b.y})` : null
        })

      // Concepts on the global ring
      const center = graphCenter()
      const radius = ringRadius(positions.values(), center, ORBIT_MARGIN)
      const { visibleConceptIds, targetAngles } = computeConceptTargets(
        model, collapse.collapsedArgIds, collapse.argCentroids, center)
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
        .style('display', d => (showBlobs && conceptVisible && visibleConceptIds.has(d)) ? null : 'none')
        .attr('transform', d => {
          const p = conceptPos(d)
          return p ? `translate(${p.x},${p.y})` : null
        })
      conceptEdgeLines
        .style('display', d => (showBlobs && conceptVisible
          && collapse.collapsedArgIds.has(d.argId) && visibleConceptIds.has(d.conceptId)) ? null : 'none')
        .attr('d', d => {
          const cp = conceptPos(d.conceptId)
          const ap = argBodiesRef.current.get(d.argId)
          if (!cp || !ap) return ''
          return spiralPath(cp.x, cp.y, ap.x, ap.y, center.x, center.y, k)
        })
    })

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

  // ── Argument selection highlight ───────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const argId = optsRef.current.selectedArgumentId
    svg.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
      .attr('stroke', d => d.id === argId ? 'rgba(100,116,139,0.6)' : 'rgba(100,116,139,0.12)')
      .attr('fill', d => d.id === argId ? 'rgba(100,116,139,0.13)' : 'rgba(100,116,139,0.04)')
  }, [opts.selectedArgumentId])

  const reheat = () => simRef.current?.alpha(0.5).restart()
  const freeze = () => simRef.current?.stop()
  return { reheat, freeze }
}
