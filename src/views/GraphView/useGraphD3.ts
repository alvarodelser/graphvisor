import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState, ArgumentBlob } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'
import { computeBlobPath, makeBlobRepulsionForce, BLOB_PAD } from '../../utils/blobGeometry'

// ── Chevron geometry constants ────────────────────────────────────────────────
const CHEV_HALF_H     = 6    // half-height (total 12 px, was 12)
const CHEV_TIP_OFFSET = 8    // tip projection past body end (was 25)
const CHEV_SPACING    = 20   // px between inner chevron backs — must equal CSS animation stride
const CHEV_TIP_REACH  = 8    // inner chevron tip projection
const CHEV_COUNT      = 28   // pre-created chevrons per direction (covers ~560 px)
const CHEV_START      = -28  // first chevron starts before x=0 for seamless left entry

interface HoverPayload {
  type: 'node'
  node: GraphNode
  x: number
  y: number
}

interface EdgeHoverPayload {
  type: 'edge'
  edge: GraphEdge
  sourceNode: GraphNode
  targetNode: GraphNode
  x: number
  y: number
}

interface BlobHoverPayload {
  type: 'blob'
  blob: ArgumentBlob
  x: number
  y: number
}

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

// ── Geometry helpers ──────────────────────────────────────────────────────────

// Full pentagon for standard semantic edges → (tip points right)
function chevronOuterPoints(len: number): string {
  const bodyEnd = Math.max(0, len - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${len},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}

// Left half-pentagon for converging edges → (tip at midpoint, opens toward source)
function halfChevronLeftPoints(len: number): string {
  const mid = len / 2
  const bodyEnd = Math.max(0, mid - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${mid},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}

// Right half-pentagon for converging edges ← (tip at midpoint, opens toward target)
function halfChevronRightPoints(len: number): string {
  const mid = len / 2
  const bodyStart = Math.min(len, mid + CHEV_TIP_OFFSET)
  return `${len},${-CHEV_HALF_H} ${bodyStart},${-CHEV_HALF_H} ${mid},0 ${bodyStart},${CHEV_HALF_H} ${len},${CHEV_HALF_H}`
}

// ── Styling helpers ───────────────────────────────────────────────────────────
function edgeStroke(group: string): string {
  return group === 'structural' ? '#64748b' : RELATION_COLORS[group]
}
function edgeFill(group: string): string {
  return group === 'structural' ? 'none' : `${RELATION_COLORS[group]}0f`
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useGraphD3(
  svgRef: RefObject<SVGSVGElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: Options
) {
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge>>()
  const optsRef = useRef(opts)
  optsRef.current = opts
  const simNodesRef = useRef<GraphNode[]>([])
  const blobGRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const zoomKRef = useRef(1)

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.style('background', '#fafbfc')

    svg.on('click', () => optsRef.current.onCanvasClick?.())

    const zoomG = svg.append('g').attr('class', 'zoom-group')
    let updateLOD: () => void = () => {}
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (e) => {
        zoomG.attr('transform', e.transform)
        updateLOD()
      })
    svg.call(zoom)

    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 14; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2)
        .attr('r', i * 240)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(7,59,76,0.35)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 8')
    }

    const { minConfidence, relationTypes, nodeTypes } = optsRef.current.filters
    const filteredEdges = edges.filter(e =>
      e.confidence >= minConfidence &&
      (relationTypes[e.relation_type] !== false)
    )

    const visibleNodes = nodes.filter(n => nodeTypes[n.type])
    const visibleNodeIdSet = new Set(visibleNodes.map(n => n.id))

    const simNodes: GraphNode[] = visibleNodes.map(n => ({ ...n }))
    simNodesRef.current = simNodes
    const simEdges: GraphEdge[] = filteredEdges
      .filter(e => {
        const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
        const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        return visibleNodeIdSet.has(sid) && visibleNodeIdSet.has(tid)
      })
      .map(e => ({ ...e }))

    const adjNodes = new Map<string, Set<string>>()
    const adjEdges = new Map<string, Set<string>>()
    simNodes.forEach(n => { adjNodes.set(n.id, new Set()); adjEdges.set(n.id, new Set()) })
    simEdges.forEach(e => {
      const sn = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tn = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      adjNodes.get(sn)?.add(tn)
      adjNodes.get(tn)?.add(sn)
      adjEdges.get(sn)?.add(e.id)
      adjEdges.get(tn)?.add(e.id)
    })

    const degree = new Map<string, number>()
    simNodes.forEach(n => degree.set(n.id, 0))
    simEdges.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      degree.set(sid, (degree.get(sid) ?? 0) + 1)
      degree.set(tid, (degree.get(tid) ?? 0) + 1)
    })

    // ── Connected components ──────────────────────────────────────────────────
    const ufParent = new Map<string, string>()
    simNodes.forEach(n => ufParent.set(n.id, n.id))
    const ufFind = (id: string): string => {
      if (ufParent.get(id) !== id) ufParent.set(id, ufFind(ufParent.get(id)!))
      return ufParent.get(id)!
    }
    simEdges.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      const rs = ufFind(sid), rt = ufFind(tid)
      if (rs !== rt) ufParent.set(rs, rt)
    })
    const compOf = new Map<string, string>()
    simNodes.forEach(n => compOf.set(n.id, ufFind(n.id)))

    const compSizes = new Map<string, number>()
    simNodes.forEach(n => compSizes.set(compOf.get(n.id)!, (compSizes.get(compOf.get(n.id)!) ?? 0) + 1))

    // Sort chains by size — biggest gets canvas center, rest spread in rings
    const sortedComps = [...compSizes.entries()].sort((a, b) => b[1] - a[1])
    const COMP_RING_R = Math.min(width, height) * 0.30
    const compCenters = new Map<string, { x: number; y: number }>()
    sortedComps.forEach(([id], idx) => {
      if (idx === 0) {
        compCenters.set(id, { x: width / 2, y: height / 2 })
      } else {
        const angle = ((idx - 1) / Math.max(1, sortedComps.length - 1)) * Math.PI * 2
        const r = COMP_RING_R + Math.floor((idx - 1) / 7) * 220
        compCenters.set(id, { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * r })
      }
    })

    // Per-component max degree (for normalising within-chain radial positioning)
    const compMaxDeg = new Map<string, number>()
    simNodes.forEach(n => {
      const c = compOf.get(n.id)!
      compMaxDeg.set(c, Math.max(compMaxDeg.get(c) ?? 0, degree.get(n.id) ?? 0))
    })

    // Pre-position nodes: high-degree nodes near component center, low-degree farther out.
    // This prevents the initial tangle — nodes start close to their final layout region.
    simNodes.forEach(n => {
      const c = compOf.get(n.id)!
      const home = compCenters.get(c)!
      const compSize = compSizes.get(c) ?? 1
      const deg = degree.get(n.id) ?? 0
      const maxDeg = compMaxDeg.get(c) ?? 1
      const spread = Math.sqrt(compSize) * 30
      const r = maxDeg > 0 ? (1 - deg / maxDeg) * spread : spread
      const angle = Math.random() * Math.PI * 2
      n.x = home.x + Math.cos(angle) * r
      n.y = home.y + Math.sin(angle) * r
      n.vx = 0; n.vy = 0
    })

    const defs = svg.append('defs')
    const blobG = zoomG.append('g').attr('class', 'blobs')
      .style('display', opts.showBlobs ? '' : 'none')
    blobGRef.current = blobG
    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')
    const argNodeG = zoomG.append('g').attr('class', 'arg-nodes')

    // entity → blob IDs it belongs to (for LOD hide logic)
    const entityToBlobIds = new Map<string, string[]>()
    for (const blob of opts.blobs) {
      for (const eid of blob.entityIds) {
        if (!entityToBlobIds.has(eid)) entityToBlobIds.set(eid, [])
        entityToBlobIds.get(eid)!.push(blob.id)
      }
    }

    // ── Blob paths ────────────────────────────────────────────────────────────
    const blobPaths = blobG.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
      .data(opts.blobs, d => d.id)
      .join('path')
      .attr('class', 'blob')
      .attr('fill', 'rgba(100,116,139,0.04)')
      .attr('stroke', 'rgba(100,116,139,0.12)')
      .attr('stroke-width', 1.5)
      .attr('pointer-events', 'fill')
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onBlobClick(d)
      })
      .on('mouseenter', function(event, d) {
        d3.select(this)
          .attr('stroke', 'rgba(100,116,139,0.45)')
          .attr('fill', 'rgba(100,116,139,0.13)')
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'blob', blob: d, x: mx, y: my })
      })
      .on('mouseleave', function(_, d) {
        const isSelected = optsRef.current.selectedArgumentId === d.id
        d3.select(this)
          .attr('stroke', isSelected ? 'rgba(100,116,139,0.6)' : 'rgba(100,116,139,0.12)')
          .attr('fill', isSelected ? 'rgba(100,116,139,0.13)' : 'rgba(100,116,139,0.04)')
        optsRef.current.onHover?.(null)
      })

    // ── Build edge groups ─────────────────────────────────────────────────────
    const edgeGroups = edgeG.selectAll<SVGGElement, GraphEdge>('g.edge-group')
      .data(simEdges, d => d.id)
      .join('g')
      .attr('class', 'edge-group')
      .style('cursor', 'pointer')

    edgeGroups.each(function(d) {
      const g = d3.select(this)
      const isStructural = d.group === 'structural'
      const isConverging = d.relation_type === 'CONTRADICTS' || d.relation_type === 'INHIBITS'

      if (isStructural) {
        // Plain line — no clip, no animation
        g.append('line')
          .attr('class', 'struct-line')
          .attr('x1', 0).attr('y1', 0)
          .attr('x2', 0).attr('y2', 0)
          .attr('stroke', '#64748b')
          .attr('stroke-width', 2)
          .attr('opacity', 0.75)

      } else if (isConverging) {
        // Two opposing half-chevrons; inner chevrons converge toward midpoint.
        // Both inner groups use the same CHEV_START + i*CHEV_SPACING positions —
        // the respective clip polygons restrict visibility to each half.
        // Because CHEV_SPACING equals the CSS animation stride (20 px), the loop
        // is seamless with no additional tick transform on the inner groups.
        defs.append('clipPath')
          .attr('id', `edgeclip-L-${d.id}`)
          .attr('clipPathUnits', 'userSpaceOnUse')
          .append('polygon')
          .attr('points', halfChevronLeftPoints(0))

        defs.append('clipPath')
          .attr('id', `edgeclip-R-${d.id}`)
          .attr('clipPathUnits', 'userSpaceOnUse')
          .append('polygon')
          .attr('points', halfChevronRightPoints(0))

        // Outer half-shapes
        g.append('polygon')
          .attr('class', 'chevron-L')
          .attr('fill', edgeFill(d.group))
          .attr('stroke', edgeStroke(d.group))
          .attr('stroke-width', 1)
          .attr('stroke-linejoin', 'miter')
          .attr('opacity', 0.85)

        g.append('polygon')
          .attr('class', 'chevron-R')
          .attr('fill', edgeFill(d.group))
          .attr('stroke', edgeStroke(d.group))
          .attr('stroke-width', 1)
          .attr('stroke-linejoin', 'miter')
          .attr('opacity', 0.85)

        // Left inner: right-pointing chevrons marching forward (→ toward midpoint)
        const leftWrap = g.append('g').attr('clip-path', `url(#edgeclip-L-${d.id})`)
        const leftInner = leftWrap.append('g').attr('class', 'chevrons-forward')
        for (let i = 0; i < CHEV_COUNT; i++) {
          const bx = CHEV_START + i * CHEV_SPACING
          leftInner.append('polyline')
            .attr('points', `${bx},${-CHEV_HALF_H} ${bx + CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`)
            .attr('fill', 'none')
            .attr('stroke', RELATION_COLORS[d.group])
            .attr('stroke-width', 3)
            .attr('stroke-linejoin', 'miter')
            .attr('stroke-linecap', 'butt')
            .attr('opacity', 0.65)
        }

        // Right inner: left-pointing chevrons marching reverse (← toward midpoint)
        const rightWrap = g.append('g').attr('clip-path', `url(#edgeclip-R-${d.id})`)
        const rightInner = rightWrap.append('g').attr('class', 'chevrons-reverse')
        for (let i = 0; i < CHEV_COUNT; i++) {
          const bx = CHEV_START + i * CHEV_SPACING
          // Left-pointing: back (widest) at bx+reach, tip (point) at bx
          rightInner.append('polyline')
            .attr('points', `${bx + CHEV_TIP_REACH},${-CHEV_HALF_H} ${bx},0 ${bx + CHEV_TIP_REACH},${CHEV_HALF_H}`)
            .attr('fill', 'none')
            .attr('stroke', RELATION_COLORS[d.group])
            .attr('stroke-width', 3)
            .attr('stroke-linejoin', 'miter')
            .attr('stroke-linecap', 'butt')
            .attr('opacity', 0.65)
        }

      } else {
        // Standard semantic edge: single pentagon + forward marching chevrons
        defs.append('clipPath')
          .attr('id', `edgeclip-${d.id}`)
          .attr('clipPathUnits', 'userSpaceOnUse')
          .append('polygon')
          .attr('points', chevronOuterPoints(0))

        g.append('polygon')
          .attr('class', 'chevron-outer')
          .attr('fill', edgeFill(d.group))
          .attr('stroke', edgeStroke(d.group))
          .attr('stroke-width', 1)
          .attr('stroke-linejoin', 'miter')
          .attr('stroke-linecap', 'butt')
          .attr('opacity', 0.85)

        const clipWrap = g.append('g').attr('clip-path', `url(#edgeclip-${d.id})`)
        const innerG = clipWrap.append('g').attr('class', 'chevrons-forward')
        for (let i = 0; i < CHEV_COUNT; i++) {
          const bx = CHEV_START + i * CHEV_SPACING
          innerG.append('polyline')
            .attr('points', `${bx},${-CHEV_HALF_H} ${bx + CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`)
            .attr('fill', 'none')
            .attr('stroke', RELATION_COLORS[d.group])
            .attr('stroke-width', 3)
            .attr('stroke-linejoin', 'miter')
            .attr('stroke-linecap', 'butt')
            .attr('opacity', 0.65)
        }
      }

      g.append('title').text(`${d.relation_type} · ${d.confidence.toFixed(2)}`)
    })

    // ── Edge hover ────────────────────────────────────────────────────────────
    edgeGroups
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        const src = d.source as GraphNode
        const tgt = d.target as GraphNode
        optsRef.current.onHover?.({ type: 'edge', edge: d, sourceNode: src, targetNode: tgt, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))
      .on('mouseenter.mute', (_, d) => {
        const sn = (d.source as GraphNode).id
        const tn = (d.target as GraphNode).id
        const involvedNodes = new Set([sn, tn])
        nodeGroups.attr('opacity', (nd: GraphNode) => involvedNodes.has(nd.id) ? 1 : 0.06)
        edgeGroups.attr('opacity', (ed: GraphEdge) => ed.id === d.id ? 1 : 0.04)
      })
      .on('mouseleave.mute', () => {
        nodeGroups.attr('opacity', null)
        edgeGroups.attr('opacity', null)
      })

    // ── Node groups ───────────────────────────────────────────────────────────
    const nodeGroups = nodeG.selectAll<SVGGElement, GraphNode>('g')
      .data(simNodes, d => d.id)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, _d) => { if (!event.active) sim.alphaTarget(0) })
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onNodeClick(d)
      })
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'node', node: d, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))
      .on('mouseenter.mute', (_, d) => {
        const neighbours = adjNodes.get(d.id) ?? new Set()
        const neighbourEdges = adjEdges.get(d.id) ?? new Set()
        nodeGroups.attr('opacity', (nd: GraphNode) => nd.id === d.id || neighbours.has(nd.id) ? 1 : 0.06)
        edgeGroups.attr('opacity', (ed: GraphEdge) => neighbourEdges.has(ed.id) ? 1 : 0.04)
      })
      .on('mouseleave.mute', () => {
        nodeGroups.attr('opacity', null)
        edgeGroups.attr('opacity', null)
      })

    nodeGroups.each(function(d) {
      const g = d3.select(this)
      const deg = degree.get(d.id) ?? 0
      if (d.type === 'Argument') {
        const size = 16 + Math.min(deg, 10) * 1.5
        g.append('rect').attr('x', -size / 2).attr('y', -size / 2)
          .attr('width', size).attr('height', size).attr('rx', 4).attr('fill', '#073b4c')
        g.append('title').text(d.full_text ?? d.label)
        const snippet = d.full_text ? d.full_text.slice(0, 28) + '…' : d.id
        g.append('text')
          .attr('class', 'node-label')
          .attr('y', size / 2 + 11)
          .attr('text-anchor', 'middle')
          .attr('pointer-events', 'none')
          .attr('fill', '#073b4c')
          .attr('font-size', '8px')
          .attr('opacity', 0)
          .text(snippet)
      } else if (d.type === 'Entity') {
        g.append('circle').attr('r', 8).attr('fill', '#118ab2')
        g.append('title').text(d.label)
        g.append('text')
          .attr('class', 'node-label')
          .attr('y', 20)
          .attr('text-anchor', 'middle')
          .attr('pointer-events', 'none')
          .attr('fill', '#118ab2')
          .attr('font-size', '8px')
          .attr('font-weight', '600')
          .attr('opacity', 0)
          .text(d.label)
      } else {
        g.append('polygon').attr('points', '0,-10 10,0 0,10 -10,0').attr('fill', '#74b9d6')
        g.append('title').text(d.label)
        g.append('text')
          .attr('class', 'node-label')
          .attr('y', 22)
          .attr('text-anchor', 'middle')
          .attr('pointer-events', 'none')
          .attr('fill', '#74b9d6')
          .attr('font-size', '8px')
          .attr('font-weight', '600')
          .attr('opacity', 0)
          .text(d.label)
      }
    })

    // Show label on hover; permanently show non-overlapping ones after sim settles
    nodeGroups
      .on('mouseenter.label', function() {
        d3.select(this).select('.node-label').attr('opacity', 1)
      })
      .on('mouseleave.label', function() {
        const el = d3.select(this).select<SVGTextElement>('.node-label').node()
        if (el && el.getAttribute('data-pinned') === '0') el.setAttribute('opacity', '0')
      })

    // ── Argument LOD nodes (counter-scaled, shown when blobs collapse on zoom-out) ──
    const argNodeGroups = argNodeG.selectAll<SVGGElement, ArgumentBlob>('g.arg-node')
      .data(opts.blobs, d => d.id)
      .join('g')
      .attr('class', 'arg-node')
      .style('display', 'none')
      .style('cursor', 'pointer')
      .on('click', (event, d) => { event.stopPropagation(); optsRef.current.onBlobClick(d) })
      .on('mouseenter', function(event, d) {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onHover?.({ type: 'blob', blob: d, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.onHover?.(null))

    argNodeGroups.each(function(d) {
      const g = d3.select(this)
      const S = 18
      g.append('rect').attr('x', -S/2).attr('y', -S/2)
        .attr('width', S).attr('height', S).attr('rx', 3).attr('fill', '#073b4c')
      g.append('text')
        .attr('y', S/2 + 9).attr('text-anchor', 'middle')
        .attr('font-size', 7).attr('font-weight', 700)
        .attr('fill', '#073b4c').attr('pointer-events', 'none')
        .text(d.argument_type.slice(0, 14))
    })

    // ── Force simulation ──────────────────────────────────────────────────────
    const maxCompSize = sortedComps[0]?.[1] ?? 1
    const sim = d3.forceSimulation<GraphNode>(simNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges)
        .id(d => d.id)
        .strength(d => d.group === 'structural' ? 0.2 : d.confidence * 0.4))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-280).theta(0.9))
      .force('collide', d3.forceCollide<GraphNode>(d => d.type === 'Argument' ? 22 : 14).strength(0.7))
      // Pull each chain toward its assigned canvas position (bigger chains get stronger pull)
      .force('compHome', (alpha: number) => {
        simNodes.forEach(n => {
          const c = compOf.get(n.id)!
          const home = compCenters.get(c)!
          const s = 0.06 * alpha * Math.sqrt(compSizes.get(c) ?? 1) / Math.sqrt(maxCompSize)
          n.vx! += (home.x - n.x!) * s
          n.vy! += (home.y - n.y!) * s
        })
      })
      // Within each chain: pull high-degree nodes toward the chain center
      .force('compRadial', (alpha: number) => {
        simNodes.forEach(n => {
          const c = compOf.get(n.id)!
          if ((compSizes.get(c) ?? 1) <= 1) return
          const home = compCenters.get(c)!
          const deg = degree.get(n.id) ?? 0
          const maxDeg = compMaxDeg.get(c) ?? 1
          const spread = Math.sqrt(compSizes.get(c) ?? 1) * 30
          const targetR = maxDeg > 0 ? (1 - deg / maxDeg) * spread : spread
          const dx = n.x! - home.x
          const dy = n.y! - home.y
          const currR = Math.sqrt(dx * dx + dy * dy) || 1
          const f = (currR - targetR) / currR * 0.12 * alpha
          n.vx! -= dx * f
          n.vy! -= dy * f
        })
      })

    // ── Blob soft anchors — spring force toward last-dropped position ─────────
    const blobMemberAnchors = new Map<string, { node: GraphNode; ax: number; ay: number }>()
    sim.force('blobAnchor', (alpha: number) => {
      for (const { node, ax, ay } of blobMemberAnchors.values()) {
        node.vx = (node.vx ?? 0) + (ax - (node.x ?? 0)) * 0.25 * alpha
        node.vy = (node.vy ?? 0) + (ay - (node.y ?? 0)) * 0.25 * alpha
      }
    })

    // ── Blob drag — moves group and squeezes members toward centroid ──────────
    interface BlobDragMember { node: GraphNode; relX: number; relY: number }
    let blobDragMembers: BlobDragMember[] = []
    let blobDragCX = 0, blobDragCY = 0
    let blobDragStartX = 0, blobDragStartY = 0

    blobPaths.call(
      d3.drag<SVGPathElement, ArgumentBlob>()
        .on('start', (event, d) => {
          event.sourceEvent.stopPropagation()
          if (!event.active) sim.alphaTarget(0.3).restart()
          blobDragStartX = event.x
          blobDragStartY = event.y
          const members = d.entityIds
            .map(id => simNodes.find(n => n.id === id))
            .filter((n): n is GraphNode => n !== undefined)
          // Compute centroid
          blobDragCX = members.reduce((s, n) => s + (n.x ?? 0), 0) / (members.length || 1)
          blobDragCY = members.reduce((s, n) => s + (n.y ?? 0), 0) / (members.length || 1)
          // Store offset from centroid (for squeezing)
          blobDragMembers = members.map(n => ({
            node: n,
            relX: (n.x ?? 0) - blobDragCX,
            relY: (n.y ?? 0) - blobDragCY,
          }))
          blobDragMembers.forEach(({ node }) => {
            blobMemberAnchors.delete(node.id)  // release anchor while dragging
            node.fx = node.x; node.fy = node.y
          })
        })
        .on('drag', (event) => {
          const dx = event.x - blobDragStartX
          const dy = event.y - blobDragStartY
          const ncx = blobDragCX + dx
          const ncy = blobDragCY + dy
          const squeeze = 0.25
          blobDragMembers.forEach(({ node, relX, relY }) => {
            node.fx = ncx + relX * squeeze
            node.fy = ncy + relY * squeeze
          })
        })
        .on('end', (event) => {
          if (!event.active) sim.alphaTarget(0)
          blobDragMembers.forEach(({ node }) => {
            node.vx = 0; node.vy = 0
            // Soft-anchor at the dropped position so forces keep them here naturally
            blobMemberAnchors.set(node.id, { node, ax: node.x ?? 0, ay: node.y ?? 0 })
            node.fx = null; node.fy = null
          })
          if (sim.alpha() < 0.1) sim.alpha(0.1).restart()
          blobDragMembers = []
        })
    )

    // ── LOD: collapse blobs to argument nodes on zoom-out ─────────────────────
    updateLOD = () => {
      const k = zoomKRef.current
      const showBlobs = optsRef.current.showBlobs
      const blobs = optsRef.current.blobs

      const collapsedBlobIds = new Set<string>()
      const argPositions = new Map<string, { x: number; y: number }>()

      if (showBlobs) {
        const nodePositions = new Map(simNodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
        for (const blob of blobs) {
          const pts = blob.entityIds
            .map(id => nodePositions.get(id))
            .filter((p): p is { x: number; y: number } => p !== undefined)
          if (pts.length < 2) continue
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
          const spread = Math.max(...pts.map(p => Math.hypot(p.x - cx, p.y - cy)))
          // Larger blobs (more spread) collapse first as you zoom out
          if ((spread + BLOB_PAD) * 2 * k < 80) {
            collapsedBlobIds.add(blob.id)
            argPositions.set(blob.id, { x: cx, y: cy })
          }
        }
      }

      // Entity hidden only if ALL its blob memberships are collapsed
      const hiddenEntityIds = new Set<string>()
      for (const [eid, blobIds] of entityToBlobIds) {
        if (blobIds.length > 0 && blobIds.every(bid => collapsedBlobIds.has(bid)))
          hiddenEntityIds.add(eid)
      }

      nodeGroups.style('display', (d: GraphNode) => hiddenEntityIds.has(d.id) ? 'none' : null)

      edgeGroups.style('display', (d: GraphEdge) => {
        const sid = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id
        const tid = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id
        return hiddenEntityIds.has(sid) && hiddenEntityIds.has(tid) ? 'none' : null
      })

      // Hide collapsed blob outlines; keep visible ones
      blobPaths.style('display', (d: ArgumentBlob) =>
        collapsedBlobIds.has(d.id) ? 'none' : null
      )

      // Position and show/hide argument LOD nodes (counter-scaled to maintain screen size)
      argNodeGroups
        .style('display', (d: ArgumentBlob) => {
          if (!showBlobs || !collapsedBlobIds.has(d.id)) return 'none'
          return null
        })
        .attr('transform', (d: ArgumentBlob) => {
          const pos = argPositions.get(d.id)
          if (!pos) return null
          return `translate(${pos.x},${pos.y}) scale(${1 / k})`
        })
    }

    // ── Tick ──────────────────────────────────────────────────────────────────
    sim.on('tick', () => {
      edgeGroups.each(function(d) {
        const src = d.source as GraphNode
        const tgt = d.target as GraphNode
        if (src.x == null || tgt.x == null) return

        const dx = tgt.x! - src.x!
        const dy = tgt.y! - src.y!
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)
        const sel = d3.select(this)

        sel.attr('transform', `translate(${src.x},${src.y}) rotate(${angle})`)

        if (d.group === 'structural') {
          sel.select('.struct-line').attr('x2', len)

        } else if (d.relation_type === 'CONTRADICTS' || d.relation_type === 'INHIBITS') {
          const ptsL = halfChevronLeftPoints(len)
          const ptsR = halfChevronRightPoints(len)
          sel.select('.chevron-L').attr('points', ptsL)
          sel.select('.chevron-R').attr('points', ptsR)
          d3.select(`#edgeclip-L-${d.id} polygon`).attr('points', ptsL)
          d3.select(`#edgeclip-R-${d.id} polygon`).attr('points', ptsR)

        } else {
          const pts = chevronOuterPoints(len)
          sel.select('.chevron-outer').attr('points', pts)
          d3.select(`#edgeclip-${d.id} polygon`).attr('points', pts)
        }
      })

      nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`)

      if (optsRef.current.showBlobs) {
        const nodePositions = new Map(simNodes.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
        blobPaths.attr('d', d => computeBlobPath(d, nodePositions) ?? '')
      }
      updateLOD()
    })

    // ── Label collision detection after sim settles ────────────────────────────
    // Run once when alpha drops below a low threshold (sim ~settled).
    // Uses estimated bounding boxes in simulation space — no getBBox needed.
    // Higher-degree nodes take priority; overlapping lower-priority labels stay hidden.
    const PX_PER_CHAR = 5.0   // 8px system-ui, slightly generous
    const LABEL_H = 14        // approximate pixel height of 8px text with padding

    let pinningDone = false
    sim.on('tick.labels', () => {
      if (pinningDone || sim.alpha() > 0.04) return
      pinningDone = true

      type LabelRect = { node: GraphNode; x1: number; x2: number; y1: number; y2: number; el: SVGTextElement }
      const rects: LabelRect[] = []

      nodeGroups.each(function(d) {
        if (d.x == null || d.y == null) return
        const el = d3.select(this).select<SVGTextElement>('.node-label').node()
        if (!el) return
        const text = el.textContent ?? ''
        if (!text) return
        const w = text.length * PX_PER_CHAR + 8  // 4px padding each side
        const nodeHalfH = d.type === 'Argument'
          ? (16 + Math.min(degree.get(d.id) ?? 0, 10) * 1.5) / 2
          : d.type === 'Entity' ? 8 : 10
        const yOff = nodeHalfH + 11
        rects.push({
          node: d,
          x1: d.x! - w / 2, x2: d.x! + w / 2,
          y1: d.y! + yOff - LABEL_H / 2, y2: d.y! + yOff + LABEL_H / 2,
          el,
        })
      })

      // Sort: Arguments before others, then by degree desc (most connected = highest priority)
      rects.sort((a, b) => {
        const ta = a.node.type === 'Argument' ? 0 : 1
        const tb = b.node.type === 'Argument' ? 0 : 1
        if (ta !== tb) return ta - tb
        return (degree.get(b.node.id) ?? 0) - (degree.get(a.node.id) ?? 0)
      })

      const visible: LabelRect[] = []
      rects.forEach(r => {
        const overlaps = visible.some(p =>
          r.x1 < p.x2 && r.x2 > p.x1 && r.y1 < p.y2 && r.y2 > p.y1
        )
        r.el.setAttribute('data-pinned', overlaps ? '0' : '1')
        r.el.setAttribute('opacity', overlaps ? '0' : '1')
        if (!overlaps) visible.push(r)
      })
    })

    // ── Resize ────────────────────────────────────────────────────────────────
    const observer = new ResizeObserver(() => {
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      sim.alpha(0.1).restart()
      d3.select(svgEl).selectAll('.rings circle').attr('cx', w / 2).attr('cy', h / 2)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    simRef.current = sim
    return () => { sim.stop(); observer.disconnect() }
  }, [nodes, edges, opts.filters])

  // ── Selection halo ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGGElement, GraphNode>('.nodes g')
      .each(function(d) {
        const g = d3.select(this)
        g.select('.selection-halo').remove()
        if (d.id === optsRef.current.selectedNodeId) {
          g.insert('circle', ':first-child')
            .attr('class', 'selection-halo')
            .attr('r', 18).attr('fill', 'none')
            .attr('stroke', '#F4A124').attr('stroke-width', 2.5)
        }
      })
  }, [opts.selectedNodeId])

  // ── Blob cluster force toggle ──────────────────────────────────────────────
  useEffect(() => {
    const sim = simRef.current
    const blobG = blobGRef.current
    if (!sim || !blobG) return
    if (opts.showBlobs) {
      sim.force('blobRepulsion', makeBlobRepulsionForce(opts.blobs, simNodesRef.current))
      blobG.style('display', '')
      // Force-render blob paths immediately so they appear even if sim has settled
      const nodePositions = new Map(
        simNodesRef.current.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }])
      )
      blobG.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
        .attr('d', d => computeBlobPath(d, nodePositions) ?? '')
      sim.alpha(0.3).restart()
    } else {
      sim.force('blobRepulsion', null)
      blobG.style('display', 'none')
      sim.alpha(0.15).restart()
    }
  }, [opts.showBlobs, opts.blobs])

  // ── Blob selection highlight ───────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    const blobG = blobGRef.current
    const argId = optsRef.current.selectedArgumentId

    if (!argId) {
      svg.selectAll<SVGGElement, GraphNode>('.nodes g').attr('opacity', null)
      svg.selectAll<SVGGElement, GraphEdge>('.edges g.edge-group').attr('opacity', null)
      if (blobG) {
        blobG.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
          .attr('stroke', 'rgba(100,116,139,0.12)')
          .attr('fill', 'rgba(100,116,139,0.04)')
      }
      return
    }

    const blob = optsRef.current.blobs.find(b => b.id === argId)
    if (!blob) return

    const blobEntitySet = new Set(blob.entityIds)

    svg.selectAll<SVGGElement, GraphNode>('.nodes g')
      .attr('opacity', d => blobEntitySet.has(d.id) ? 1 : 0.06)

    svg.selectAll<SVGGElement, GraphEdge>('.edges g.edge-group')
      .attr('opacity', d => {
        const sid = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id
        const tid = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id
        return blobEntitySet.has(sid) && blobEntitySet.has(tid) ? 1 : 0.04
      })

    if (blobG) {
      blobG.selectAll<SVGPathElement, ArgumentBlob>('path.blob')
        .attr('stroke', d => d.id === argId ? 'rgba(100,116,139,0.6)' : 'rgba(100,116,139,0.12)')
        .attr('fill', d => d.id === argId ? 'rgba(100,116,139,0.13)' : 'rgba(100,116,139,0.04)')
    }
  }, [opts.selectedArgumentId])

  const reheat = () => simRef.current?.alpha(0.5).restart()
  const freeze = () => simRef.current?.stop()

  return { reheat, freeze }
}
