import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState } from '../../types'
import { computeRadialTiers, RELATION_COLORS } from '../../utils/geometry'

const RADIAL_RADII = [0, 120, 240, 360]
const PULSE_DUR = 3000

interface Options {
  filters: FilterState
  selectedNodeId: string | null
  onNodeClick: (node: GraphNode) => void
  onNodeHover?: (node: GraphNode | null, x: number, y: number) => void
  onCanvasClick?: () => void
}

export function useGraphD3(
  svgRef: RefObject<SVGSVGElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: Options
) {
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge>>()
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.style('background', '#fafbfc')

    // Canvas background click → deselect
    svg.on('click', () => optsRef.current.onCanvasClick?.())

    // SVG defs: arrowhead markers per relation group
    const defs = svg.append('defs')
    const markerDefs = [
      { id: 'arrow-positive', color: '#06d6a0' },
      { id: 'arrow-negative', color: '#ef476f' },
      { id: 'arrow-causal',   color: '#ffd166' },
    ]
    markerDefs.forEach(({ id, color }) => {
      defs.append('marker')
        .attr('id', id)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 5)
        .attr('markerHeight', 5)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 Z')
        .attr('fill', color)
    })

    const markerMap: Record<string, string> = {
      positive: 'url(#arrow-positive)',
      negative: 'url(#arrow-negative)',
      causal:   'url(#arrow-causal)',
    }

    // Zoom
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (e) => zoomG.attr('transform', e.transform))
    svg.call(zoom)

    // Concentric rings
    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 7; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2)
        .attr('r', i * 120)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(7,59,76,0.05)')
        .attr('stroke-width', 1)
    }

    const { minConfidence, relationGroups, nodeTypes } = optsRef.current.filters
    const filteredEdges = edges.filter(
      e => e.confidence >= minConfidence && relationGroups[e.group]
    )

    const visibleNodes = nodes.filter(n => nodeTypes[n.type])
    const visibleNodeIdSet = new Set(visibleNodes.map(n => n.id))
    const tiers = computeRadialTiers(visibleNodes, filteredEdges)

    const simNodes: GraphNode[] = visibleNodes.map(n => ({ ...n }))

    // Fix: only include edges where BOTH endpoints are in visibleNodes
    const simEdges: GraphEdge[] = filteredEdges
      .filter(e => {
        const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
        const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        return visibleNodeIdSet.has(sid) && visibleNodeIdSet.has(tid)
      })
      .map(e => ({ ...e }))

    // Adjacency maps for hover-mute (built before D3 resolves string IDs)
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

    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')
    const pulseG = zoomG.append('g').attr('class', 'pulses').attr('pointer-events', 'none')

    // Edges (mute handlers added AFTER nodeGroups is defined below)
    const edgeSel = edgeG.selectAll<SVGLineElement, GraphEdge>('line')
      .data(simEdges, d => d.id)
      .join('line')
      .attr('class', d => {
        if (d.group === 'structural') return 'edge-structural'
        if (d.relation_type === 'CONTRADICTS' || d.relation_type === 'INHIBITS') return 'edge-semantic-reverse'
        return 'edge-semantic-forward'
      })
      .attr('stroke', d => RELATION_COLORS[d.group])
      .attr('stroke-width', d => d.group === 'structural' ? 1 : Math.max(1, d.confidence * 3))
      .attr('opacity', d => d.group === 'structural' ? 0.25 : 0.8)
      .attr('marker-end', d => markerMap[d.group] ?? null)

    edgeSel.append('title').text(d => `${d.relation_type} · ${d.confidence.toFixed(2)}`)

    // Pulse circles for semantic edges
    const semanticEdges = simEdges.filter(e => e.group !== 'structural')
    const pulseOffsets = new Map(semanticEdges.map((e, i) => [e.id, (i / Math.max(semanticEdges.length, 1)) * PULSE_DUR]))

    const pulses = pulseG.selectAll<SVGCircleElement, GraphEdge>('circle')
      .data(semanticEdges, d => d.id)
      .join('circle')
      .attr('r', 3)
      .attr('fill', d => RELATION_COLORS[d.group])
      .attr('opacity', 0)

    // Node groups
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
          .on('end', (event, _d) => {
            if (!event.active) sim.alphaTarget(0)
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onNodeClick(d)
      })
      .on('mouseenter.tooltip', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.onNodeHover?.(d, mx, my)
      })
      .on('mouseleave.tooltip', () => {
        optsRef.current.onNodeHover?.(null, 0, 0)
      })
      .on('mouseenter.mute', (_, d) => {
        const neighbours = adjNodes.get(d.id) ?? new Set()
        const neighbourEdges = adjEdges.get(d.id) ?? new Set()
        nodeGroups.attr('opacity', (nd: GraphNode) => nd.id === d.id || neighbours.has(nd.id) ? 1 : 0.06)
        edgeSel.attr('opacity', (ed: GraphEdge) => neighbourEdges.has(ed.id) ? 0.8 : 0.04)
      })
      .on('mouseleave.mute', () => {
        nodeGroups.attr('opacity', null)
        edgeSel.attr('opacity', (d: GraphEdge) => d.group === 'structural' ? 0.25 : 0.8)
      })

    // Edge mute handlers — added here so nodeGroups closure is already initialized
    edgeSel
      .on('mouseenter.mute', (_, d) => {
        const sn = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id
        const tn = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id
        const involvedNodes = new Set([sn, tn])
        const involvedEdges = new Set<string>([d.id])
        ;(adjEdges.get(sn) ?? new Set()).forEach(id => involvedEdges.add(id))
        ;(adjEdges.get(tn) ?? new Set()).forEach(id => involvedEdges.add(id))
        nodeGroups.attr('opacity', (nd: GraphNode) => involvedNodes.has(nd.id) ? 1 : 0.06)
        edgeSel.attr('opacity', (ed: GraphEdge) => involvedEdges.has(ed.id) ? 0.8 : 0.04)
      })
      .on('mouseleave.mute', () => {
        nodeGroups.attr('opacity', null)
        edgeSel.attr('opacity', (d: GraphEdge) => d.group === 'structural' ? 0.25 : 0.8)
      })

    nodeGroups.each(function(d) {
      const g = d3.select(this)
      const deg = degree.get(d.id) ?? 0
      if (d.type === 'Argument') {
        const size = 16 + Math.min(deg, 10) * 1.5
        g.append('rect')
          .attr('x', -size / 2).attr('y', -size / 2)
          .attr('width', size).attr('height', size)
          .attr('rx', 4).attr('fill', '#073b4c')
        g.append('title').text(d.full_text ?? d.label)
      } else if (d.type === 'Entity') {
        g.append('circle').attr('r', 8).attr('fill', '#118ab2')
        g.append('title').text(d.label)
      } else {
        g.append('polygon').attr('points', '0,-10 10,0 0,10 -10,0').attr('fill', '#74b9d6')
        g.append('title').text(d.label)
      }
    })

    const sim = d3.forceSimulation<GraphNode>(simNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges)
        .id(d => d.id)
        .strength(d => d.group === 'structural' ? 0.2 : d.confidence * 0.4))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-180).theta(0.9))
      .force('collide', d3.forceCollide<GraphNode>(d => d.type === 'Argument' ? 22 : 14).strength(0.7))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('radial',
        d3.forceRadial<GraphNode>(
          d => d.type === 'Argument' ? RADIAL_RADII[tiers.get(d.id) ?? 3] : 0,
          width / 2, height / 2
        ).strength(d => d.type === 'Argument' ? 0.4 : 0)
      )

    sim.on('tick', () => {
      edgeSel
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!)
      nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Pulse timer
    const pulseTimer = d3.timer(() => {
      const now = Date.now()
      pulses.each(function(e) {
        const src = e.source as GraphNode
        const tgt = e.target as GraphNode
        if (src.x == null || tgt.x == null) return
        const offset = pulseOffsets.get(e.id) ?? 0
        const t = ((now + offset) % PULSE_DUR) / PULSE_DUR
        const opacity = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 0.9
        d3.select(this)
          .attr('cx', src.x! + (tgt.x! - src.x!) * t)
          .attr('cy', src.y! + (tgt.y! - src.y!) * t)
          .attr('opacity', opacity)
      })
    })

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      ;(sim.force('center') as d3.ForceCenter<GraphNode>).x(w / 2).y(h / 2)
      sim.alpha(0.1).restart()
      d3.select(svgEl).selectAll('.rings circle').attr('cx', w / 2).attr('cy', h / 2)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    simRef.current = sim
    return () => { sim.stop(); pulseTimer.stop(); observer.disconnect() }
  }, [nodes, edges, opts.filters])

  // Selection halo
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

  const reheat = () => simRef.current?.alpha(0.5).restart()
  const freeze = () => simRef.current?.stop()

  return { reheat, freeze }
}
