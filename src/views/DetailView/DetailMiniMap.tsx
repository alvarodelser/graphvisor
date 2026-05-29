import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import type { ArgumentDetail, DocNode } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  allDocs: DocNode[]
}

export function DetailMiniMap({ detail, allDocs }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || allDocs.length === 0) return
    const el = svgRef.current
    const { width, height } = el.getBoundingClientRect()
    const svg = d3.select(el)
    svg.selectAll('*').remove()

    const pad = 12
    const xExt = d3.extent(allDocs, d => d.umap_x) as [number, number]
    const yExt = d3.extent(allDocs, d => d.umap_y) as [number, number]
    const xScale = d3.scaleLinear().domain(xExt).range([pad, width - pad])
    const yScale = d3.scaleLinear().domain(yExt).range([height - pad, pad])

    const focalId = detail.argument.source_document_id
    const relatedMap = new Map<string, string>()
    detail.relations.forEach(r => relatedMap.set(r.source_document_id, r.group))
    const focalDoc = allDocs.find(d => d.id === focalId)

    if (focalDoc) {
      const lineG = svg.append('g')
      detail.relations.forEach(rel => {
        const target = allDocs.find(d => d.id === rel.source_document_id)
        if (!target || target.id === focalId) return
        lineG.append('line')
          .attr('x1', xScale(focalDoc.umap_x)).attr('y1', yScale(focalDoc.umap_y))
          .attr('x2', xScale(target.umap_x)).attr('y2', yScale(target.umap_y))
          .attr('stroke', RELATION_COLORS[rel.group])
          .attr('stroke-width', Math.max(0.5, rel.confidence * 1.5))
          .attr('opacity', 0.65)
          .append('title').text(`${rel.relation_type} · ${rel.confidence.toFixed(2)}`)
      })
    }

    const dotG = svg.append('g')
    dotG.selectAll('circle')
      .data(allDocs)
      .join('circle')
      .attr('cx', d => xScale(d.umap_x))
      .attr('cy', d => yScale(d.umap_y))
      .attr('r', d => d.id === focalId ? 7 : relatedMap.has(d.id) ? 4 : 2)
      .attr('fill', d =>
        d.id === focalId ? '#F4A124'
        : relatedMap.has(d.id) ? '#118ab2'
        : '#d1d5db')
      .append('title').text(d => d.title)

    if (focalDoc) {
      dotG.append('circle')
        .attr('cx', xScale(focalDoc.umap_x)).attr('cy', yScale(focalDoc.umap_y))
        .attr('r', 11).attr('fill', 'none').attr('stroke', '#F4A124').attr('stroke-width', 2)
    }
  }, [detail, allDocs])

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: 180, display: 'block', background: '#fafbfc', borderRadius: 8 }}
    />
  )
}
