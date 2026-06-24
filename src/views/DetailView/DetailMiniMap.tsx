import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import type { ArgumentDetail, DocNode } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

export interface DocHoverInfo {
  doc: DocNode
  isFocal: boolean
  relInfo: { group: string; relations: { type: string; confidence: number }[] } | null
}

interface Props {
  detail: ArgumentDetail
  allDocs: DocNode[]
  onHoverChange?: (info: DocHoverInfo | null) => void
}

export function DetailMiniMap({ detail, allDocs, onHoverChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || allDocs.length === 0) return
    const el = svgRef.current
    const { width, height } = el.getBoundingClientRect()
    const svg = d3.select(el)
    svg.selectAll('*').remove()

    const pad = 12
    const xExt = d3.extent(allDocs, d => d.pca_x) as [number, number]
    const yExt = d3.extent(allDocs, d => d.pca_y) as [number, number]
    const xScale = d3.scaleLinear().domain(xExt).range([pad, width - pad])
    const yScale = d3.scaleLinear().domain(yExt).range([height - pad, pad])

    const focalId = detail.argument.source_document_id
    const relatedMap = new Map<string, string>()
    detail.relations.forEach(r => relatedMap.set(r.source_document_id, r.group))

    const relInfoMap = new Map<string, { group: string; relations: { type: string; confidence: number }[] }>()
    detail.relations.forEach(r => {
      const entry = relInfoMap.get(r.source_document_id)
      if (entry) {
        entry.relations.push({ type: r.relation_type, confidence: r.confidence })
      } else {
        relInfoMap.set(r.source_document_id, {
          group: r.group,
          relations: [{ type: r.relation_type, confidence: r.confidence }],
        })
      }
    })

    const focalDoc = allDocs.find(d => d.id === focalId)

    if (focalDoc) {
      const lineG = svg.append('g')
      detail.relations.forEach(rel => {
        const target = allDocs.find(d => d.id === rel.source_document_id)
        if (!target || target.id === focalId) return
        lineG.append('line')
          .attr('x1', xScale(focalDoc.pca_x)).attr('y1', yScale(focalDoc.pca_y))
          .attr('x2', xScale(target.pca_x)).attr('y2', yScale(target.pca_y))
          .attr('stroke', RELATION_COLORS[rel.group])
          .attr('stroke-width', Math.max(0.5, rel.confidence * 1.5))
          .attr('opacity', 0.65)
      })
    }

    const dotG = svg.append('g')
    dotG.selectAll<SVGCircleElement, DocNode>('circle')
      .data(allDocs)
      .join('circle')
      .attr('cx', d => xScale(d.pca_x))
      .attr('cy', d => yScale(d.pca_y))
      .attr('r', d => d.id === focalId ? 7 : relatedMap.has(d.id) ? 4 : 2)
      .attr('fill', d =>
        d.id === focalId ? '#ef476f'
        : relatedMap.has(d.id) ? '#118ab2'
        : '#d1d5db')
      .style('cursor', d => (d.id === focalId || relatedMap.has(d.id)) ? 'pointer' : 'default')
      .on('mouseenter', (_event: MouseEvent, d: DocNode) => {
        onHoverChange?.({
          doc: d,
          isFocal: d.id === focalId,
          relInfo: relInfoMap.get(d.id) ?? null,
        })
      })
      .on('mouseleave', () => onHoverChange?.(null))

    if (focalDoc) {
      dotG.append('circle')
        .attr('cx', xScale(focalDoc.pca_x)).attr('cy', yScale(focalDoc.pca_y))
        .attr('r', 11).attr('fill', 'none').attr('stroke', '#ef476f').attr('stroke-width', 2)
        .attr('pointer-events', 'none')
    }
  }, [detail, allDocs, onHoverChange])

  return (
    <div style={{ background: '#fafbfc' }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: 160, display: 'block' }}
      />
    </div>
  )
}
