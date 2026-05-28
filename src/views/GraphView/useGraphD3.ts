import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState } from '../../types'
import { computeRadialTiers, RELATION_COLORS } from '../../utils/geometry'

const RADIAL_RADII = [0, 120, 240, 360]

interface Options {
  filters: FilterState
  selectedNodeId: string | null
  onNodeClick: (node: GraphNode) => void
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

    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (e) => zoomG.attr('transform', e.transform))
    svg.call(zoom)

    // Concentric rings (inside zoom group, transform with pan/zoom)
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
    const visibleNodeIds = new Set<string>()
    filteredEdges.forEach(e => {
      visibleNodeIds.add(typeof e.source === 'string' ? e.source : e.source.id)
      visibleNodeIds.add(typeof e.target === 'string' ? e.target : e.target.id)
    })
    nodes.filter(n => nodeTypes[n.type]).forEach(n => visibleNodeIds.add(n.id))

    const visibleNodes = nodes.filter(n => nodeTypes[n.type])
    const tiers = computeRadialTiers(visibleNodes, filteredEdges)

    const simNodes: GraphNode[] = visibleNodes.map(n => ({ ...n }))
    const simEdges: GraphEdge[] = filteredEdges.map(e => ({ ...e }))

    const degree = new Map<string, number>()
    simNodes.forEach(n => degree.set(n.id, 0))
    filteredEdges.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : e.source.id
      const tid = typeof e.target === 'string' ? e.target : e.target.id
      degree.set(sid, (degree.get(sid) ?? 0) + 1)
      degree.set(tid, (degree.get(tid) ?? 0) + 1)
    })

    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')

    const edgeSel = edgeG.selectAll<SVGLineElement, GraphEdge>('line')
      .data(simEdges, d => d.id)
      .join('line')
      .attr('stroke', d => RELATION_COLORS[d.group])
      .attr('stroke-width', d => d.group === 'structural' ? 1 : Math.max(1, d.confidence * 3))
      .attr('stroke-dasharray', d =>
        d.relation_type === 'CONTRADICTS' || d.relation_type === 'INHIBITS' ? '5 4' : null)
      .attr('opacity', d => d.group === 'structural' ? 0.25 : 0.8)

    edgeSel.append('title')
      .text(d => `${d.relation_type} · ${d.confidence.toFixed(2)}`)

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
            // sticky — keep fx/fy
          })
      )
      .on('click', (_, d) => optsRef.current.onNodeClick(d))

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

    simRef.current = sim
    return () => { sim.stop() }
  }, [nodes, edges, opts.filters])

  // Update selection halo without re-running simulation
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
