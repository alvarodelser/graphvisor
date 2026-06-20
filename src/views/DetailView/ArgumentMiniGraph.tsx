import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import type { ArgumentDetail } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

// ── Chevron geometry — mirrors useGraphD3 constants exactly ──────────────────
const CHEV_HALF_H     = 6
const CHEV_TIP_OFFSET = 8
const CHEV_SPACING    = 20
const CHEV_TIP_REACH  = 8
const CHEV_COUNT      = 20
const CHEV_START      = -28

function chevronOuterPoints(len: number) {
  const bodyEnd = Math.max(0, len - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${len},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}
function halfChevronLeftPoints(len: number) {
  const mid = len / 2, bodyEnd = Math.max(0, mid - CHEV_TIP_OFFSET)
  return `0,${-CHEV_HALF_H} ${bodyEnd},${-CHEV_HALF_H} ${mid},0 ${bodyEnd},${CHEV_HALF_H} 0,${CHEV_HALF_H}`
}
function halfChevronRightPoints(len: number) {
  const mid = len / 2, bodyStart = Math.min(len, mid + CHEV_TIP_OFFSET)
  return `${len},${-CHEV_HALF_H} ${bodyStart},${-CHEV_HALF_H} ${mid},0 ${bodyStart},${CHEV_HALF_H} ${len},${CHEV_HALF_H}`
}
function edgeStroke(group: string) {
  return group === 'structural' ? '#64748b' : (RELATION_COLORS as Record<string, string>)[group]
}
function edgeFill(group: string) {
  return group === 'structural' ? 'none' : `${(RELATION_COLORS as Record<string, string>)[group]}0f`
}

interface NodeDatum extends d3.SimulationNodeDatum { id: string; label: string }
interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
  id: string; relation: string; group: string; confidence: number
}

export type PanelInfo =
  | { kind: 'node'; label: string; rels: { type: string; other: string; out: boolean; confidence: number }[] }
  | { kind: 'edge'; subject: string; relation: string; object: string; group: string; confidence: number }

interface Props {
  detail: ArgumentDetail
  onPanelChange?: (panel: PanelInfo | null) => void
}

export function ArgumentMiniGraph({ detail, onPanelChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !detail.entityGraph?.length) return
    const el = svgRef.current
    const { width, height } = el.getBoundingClientRect()
    const svg = d3.select(el)
    svg.selectAll('*').remove()
    svg.style('background', '#fafbfc')

    const triples = detail.entityGraph!

    const nodeMap = new Map<string, NodeDatum>()
    triples.forEach(t => {
      if (!nodeMap.has(t.subject)) nodeMap.set(t.subject, { id: t.subject, label: t.subject })
      if (!nodeMap.has(t.object))  nodeMap.set(t.object,  { id: t.object,  label: t.object  })
    })
    const nodes: NodeDatum[] = Array.from(nodeMap.values())
    const links: LinkDatum[] = triples.map((t, i) => ({
      id: `ml${i}`,
      source: t.subject,
      target: t.object,
      relation: t.relation_type,
      group: t.group,
      confidence: t.confidence,
    }))

    const defs = svg.append('defs')
    const edgeG = svg.append('g')
    const nodeG = svg.append('g')

    // ── Edge groups ──────────────────────────────────────────────────────────
    const edgeGroups = edgeG.selectAll<SVGGElement, LinkDatum>('g')
      .data(links, d => d.id)
      .join('g')

    edgeGroups.each(function(d) {
      const g = d3.select(this)
      const isConverging = d.relation === 'CONTRADICTS' || d.relation === 'INHIBITS'

      if (d.group === 'structural') {
        g.append('line').attr('class', 'struct-line')
          .attr('stroke', '#64748b').attr('stroke-width', 1.5).attr('opacity', 0.7)

      } else if (isConverging) {
        defs.append('clipPath').attr('id', `mc-L-${d.id}`).attr('clipPathUnits', 'userSpaceOnUse')
          .append('polygon').attr('points', halfChevronLeftPoints(0))
        defs.append('clipPath').attr('id', `mc-R-${d.id}`).attr('clipPathUnits', 'userSpaceOnUse')
          .append('polygon').attr('points', halfChevronRightPoints(0))

        g.append('polygon').attr('class', 'chevron-L')
          .attr('fill', edgeFill(d.group)).attr('stroke', edgeStroke(d.group))
          .attr('stroke-width', 1).attr('stroke-linejoin', 'miter').attr('opacity', 0.85)
        g.append('polygon').attr('class', 'chevron-R')
          .attr('fill', edgeFill(d.group)).attr('stroke', edgeStroke(d.group))
          .attr('stroke-width', 1).attr('stroke-linejoin', 'miter').attr('opacity', 0.85)

        const li = g.append('g').attr('clip-path', `url(#mc-L-${d.id})`).append('g').attr('class', 'chevrons-forward')
        const ri = g.append('g').attr('clip-path', `url(#mc-R-${d.id})`).append('g').attr('class', 'chevrons-reverse')
        for (let i = 0; i < CHEV_COUNT; i++) {
          const bx = CHEV_START + i * CHEV_SPACING
          li.append('polyline')
            .attr('points', `${bx},${-CHEV_HALF_H} ${bx + CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`)
            .attr('fill', 'none').attr('stroke', edgeStroke(d.group))
            .attr('stroke-width', 2).attr('stroke-linejoin', 'miter').attr('opacity', 0.65)
          ri.append('polyline')
            .attr('points', `${bx + CHEV_TIP_REACH},${-CHEV_HALF_H} ${bx},0 ${bx + CHEV_TIP_REACH},${CHEV_HALF_H}`)
            .attr('fill', 'none').attr('stroke', edgeStroke(d.group))
            .attr('stroke-width', 2).attr('stroke-linejoin', 'miter').attr('opacity', 0.65)
        }

      } else {
        defs.append('clipPath').attr('id', `mc-${d.id}`).attr('clipPathUnits', 'userSpaceOnUse')
          .append('polygon').attr('points', chevronOuterPoints(0))
        g.append('polygon').attr('class', 'chevron-outer')
          .attr('fill', edgeFill(d.group)).attr('stroke', edgeStroke(d.group))
          .attr('stroke-width', 1).attr('stroke-linejoin', 'miter').attr('opacity', 0.85)
        const ci = g.append('g').attr('clip-path', `url(#mc-${d.id})`).append('g').attr('class', 'chevrons-forward')
        for (let i = 0; i < CHEV_COUNT; i++) {
          const bx = CHEV_START + i * CHEV_SPACING
          ci.append('polyline')
            .attr('points', `${bx},${-CHEV_HALF_H} ${bx + CHEV_TIP_REACH},0 ${bx},${CHEV_HALF_H}`)
            .attr('fill', 'none').attr('stroke', edgeStroke(d.group))
            .attr('stroke-width', 2).attr('stroke-linejoin', 'miter').attr('opacity', 0.65)
        }
      }
    })

    // ── Node groups ──────────────────────────────────────────────────────────
    const nodeGroups = nodeG.selectAll<SVGGElement, NodeDatum>('g')
      .data(nodes, d => d.id)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, NodeDatum>()
          .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null })
      )

    nodeGroups.each(function(d) {
      const g = d3.select(this)
      g.append('circle').attr('r', 6).attr('fill', '#118ab2').attr('stroke', '#fff').attr('stroke-width', 1.5)
      g.append('text').attr('class', 'mg-label')
        .attr('y', 16).attr('text-anchor', 'middle').attr('pointer-events', 'none')
        .attr('fill', '#118ab2').attr('font-size', '7px').attr('font-weight', '600').attr('opacity', 0)
        .text(d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label)
    })

    nodeGroups
      .on('mouseenter.label', function() { d3.select(this).select('.mg-label').attr('opacity', 1) })
      .on('mouseleave.label', function() { d3.select(this).select('.mg-label').attr('opacity', 0) })
      .on('mouseenter', (_event, d) => {
        const rels = triples
          .filter(t => t.subject === d.id || t.object === d.id)
          .map(t => ({
            type: t.relation_type.toLowerCase().replace(/_/g, ' '),
            other: t.subject === d.id ? t.object : t.subject,
            out: t.subject === d.id,
            confidence: t.confidence,
          }))
        onPanelChange?.({ kind: 'node', label: d.label, rels })
        const adjIds = new Set(rels.map(r => r.other))
        nodeGroups.attr('opacity', (nd: NodeDatum) => nd.id === d.id || adjIds.has(nd.id) ? 1 : 0.12)
        edgeGroups.attr('opacity', (ld: LinkDatum) => {
          const sid = typeof ld.source === 'string' ? ld.source : (ld.source as NodeDatum).id
          const tid = typeof ld.target === 'string' ? ld.target : (ld.target as NodeDatum).id
          return sid === d.id || tid === d.id ? 1 : 0.05
        })
      })
      .on('mouseleave', () => {
        onPanelChange?.(null)
        nodeGroups.attr('opacity', null)
        edgeGroups.attr('opacity', null)
      })

    // ── Edge hover ───────────────────────────────────────────────────────────
    edgeGroups
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => {
        const src = d.source as NodeDatum, tgt = d.target as NodeDatum
        onPanelChange?.({
          kind: 'edge',
          subject: src.label ?? (typeof d.source === 'string' ? d.source : ''),
          relation: d.relation.toLowerCase().replace(/_/g, ' '),
          object: tgt.label ?? (typeof d.target === 'string' ? d.target : ''),
          group: d.group,
          confidence: d.confidence,
        })
        nodeGroups.attr('opacity', (nd: NodeDatum) => nd.id === src.id || nd.id === tgt.id ? 1 : 0.12)
        edgeGroups.attr('opacity', (ld: LinkDatum) => ld.id === d.id ? 1 : 0.05)
      })
      .on('mouseleave', () => {
        onPanelChange?.(null)
        nodeGroups.attr('opacity', null)
        edgeGroups.attr('opacity', null)
      })

    // ── Force simulation ─────────────────────────────────────────────────────
    const sim = d3.forceSimulation<NodeDatum>(nodes)
      .force('link', d3.forceLink<NodeDatum, LinkDatum>(links).id(d => d.id).distance(40).strength(d => d.confidence * 0.6))
      .force('charge', d3.forceManyBody<NodeDatum>().strength(-60))
      .force('collide', d3.forceCollide<NodeDatum>(10))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(0.5))
      .force('x', d3.forceX(width / 2).strength(0.1))
      .force('y', d3.forceY(height / 2).strength(0.1))

    const NODE_PAD = 16
    sim.on('tick', () => {
      nodes.forEach(n => {
        n.x = Math.max(NODE_PAD, Math.min(width - NODE_PAD, n.x ?? width / 2))
        n.y = Math.max(NODE_PAD, Math.min(height - NODE_PAD, n.y ?? height / 2))
      })
      edgeGroups.each(function(d) {
        const src = d.source as NodeDatum, tgt = d.target as NodeDatum
        if (src.x == null || tgt.x == null) return
        const dx = tgt.x - src.x, dy = (tgt.y ?? 0) - (src.y ?? 0)
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)
        const sel = d3.select(this)
        sel.attr('transform', `translate(${src.x},${src.y}) rotate(${angle})`)

        if (d.group === 'structural') {
          sel.select('.struct-line').attr('x2', len)
        } else if (d.relation === 'CONTRADICTS' || d.relation === 'INHIBITS') {
          const pL = halfChevronLeftPoints(len), pR = halfChevronRightPoints(len)
          sel.select('.chevron-L').attr('points', pL)
          sel.select('.chevron-R').attr('points', pR)
          d3.select(`#mc-L-${d.id} polygon`).attr('points', pL)
          d3.select(`#mc-R-${d.id} polygon`).attr('points', pR)
        } else {
          const pts = chevronOuterPoints(len)
          sel.select('.chevron-outer').attr('points', pts)
          d3.select(`#mc-${d.id} polygon`).attr('points', pts)
        }
      })
      nodeGroups.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => { sim.stop() }
  }, [detail, onPanelChange])

  return (
    <div style={{ background: '#fafbfc' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 260, display: 'block' }} />
    </div>
  )
}
