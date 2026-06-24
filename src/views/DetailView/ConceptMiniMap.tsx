import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import type { DocNode, ConceptDocStat } from '../../types'

interface Props {
  docStats: ConceptDocStat[]
  allDocs: DocNode[]
  onHoverChange?: (info: ConceptHoverInfo | null) => void
}

export interface ConceptHoverInfo {
  doc: DocNode
  stat: ConceptDocStat | null
}

const EMPTY = '#e5e7eb'
const CONCEPT = '#6366f1'

export function ConceptMiniMap({ docStats, allDocs, onHoverChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

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
      .on('mouseenter', (_event: MouseEvent, d: DocNode) => {
        onHoverChange?.({ doc: d, stat: statById.get(d.id) ?? null })
      })
      .on('mouseleave', () => onHoverChange?.(null))
  }, [docStats, allDocs, onHoverChange])

  return (
    <div style={{ background: '#fafbfc' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 160, display: 'block' }} />
    </div>
  )
}
