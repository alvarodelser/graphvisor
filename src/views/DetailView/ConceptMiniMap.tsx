import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import * as d3 from 'd3'
import type { DocNode, ConceptDocStat } from '../../types'

interface Props {
  docStats: ConceptDocStat[]
  allDocs: DocNode[]
}

interface TooltipState {
  clientX: number
  clientY: number
  doc: DocNode
  stat: ConceptDocStat | null
}

const EMPTY = '#e5e7eb'
const CONCEPT = '#6366f1'

export function ConceptMiniMap({ docStats, allDocs }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    if (!svgRef.current || allDocs.length === 0) return
    const el = svgRef.current
    const { width, height } = el.getBoundingClientRect()
    const svg = d3.select(el)
    svg.selectAll('*').remove()

    const statById = new Map(docStats.map(s => [s.docId, s]))
    const proportion = (d: DocNode) => {
      const s = statById.get(d.id)
      return s && s.total > 0 ? s.withConcept / s.total : 0
    }
    const color = d3.scaleLinear<string>().domain([0, 1]).range([EMPTY, CONCEPT])

    const pad = 12
    const xExt = d3.extent(allDocs, d => d.pca_x) as [number, number]
    const yExt = d3.extent(allDocs, d => d.pca_y) as [number, number]
    const xScale = d3.scaleLinear().domain(xExt).range([pad, width - pad])
    const yScale = d3.scaleLinear().domain(yExt).range([height - pad, pad])

    svg.append('g').selectAll<SVGCircleElement, DocNode>('circle')
      .data(allDocs)
      .join('circle')
      .attr('cx', d => xScale(d.pca_x))
      .attr('cy', d => yScale(d.pca_y))
      .attr('r', d => {
        const s = statById.get(d.id)
        return s && s.withConcept > 0 ? 4 + proportion(d) * 5 : 2
      })
      .attr('fill', d => {
        const s = statById.get(d.id)
        return s && s.withConcept > 0 ? color(proportion(d)) : EMPTY
      })
      .attr('stroke', d => {
        const s = statById.get(d.id)
        return s && s.withConcept > 0 ? CONCEPT : 'none'
      })
      .attr('stroke-width', 0.8)
      .style('cursor', 'pointer')
      .on('mouseenter', (event: MouseEvent, d: DocNode) => {
        setTooltip({ clientX: event.clientX, clientY: event.clientY, doc: d, stat: statById.get(d.id) ?? null })
      })
      .on('mousemove', (event: MouseEvent) => {
        setTooltip(prev => prev ? { ...prev, clientX: event.clientX, clientY: event.clientY } : null)
      })
      .on('mouseleave', () => setTooltip(null))
  }, [docStats, allDocs])

  return (
    <div style={{ position: 'relative', background: '#fafbfc', borderRadius: 8 }}>
      <svg ref={svgRef} style={{ width: '100%', height: 120, display: 'block', borderRadius: 8 }} />

      {tooltip && createPortal(
        <div className="card" style={{
          position: 'fixed', left: tooltip.clientX + 14, top: tooltip.clientY - 14,
          zIndex: 9999, padding: '8px 11px', maxWidth: 220, pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#073b4c', marginBottom: 3, lineHeight: 1.3 }}>
            {tooltip.doc.title}
          </div>
          {tooltip.stat && tooltip.stat.withConcept > 0 ? (
            <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600 }}>
              {tooltip.stat.withConcept} / {tooltip.stat.total} arguments
              {' '}({Math.round((tooltip.stat.withConcept / tooltip.stat.total) * 100)}%)
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#9ca3af' }}>No arguments with this concept</div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
