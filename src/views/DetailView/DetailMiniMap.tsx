import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import * as d3 from 'd3'
import type { ArgumentDetail, DocNode } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  allDocs: DocNode[]
}

interface TooltipState {
  clientX: number
  clientY: number
  doc: DocNode
  isFocal: boolean
  relInfo: { group: string; relations: { type: string; confidence: number }[] } | null
}

export function DetailMiniMap({ detail, allDocs }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const focalDocId = detail.argument.source_document_id
  const relatedDocIds = new Set(detail.relations.map(r => r.source_document_id))
  const relatedDocs = allDocs.filter(d => relatedDocIds.has(d.id) && d.id !== focalDocId)

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

    // Rich relation info for tooltips
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
        d.id === focalId ? '#F4A124'
        : relatedMap.has(d.id) ? '#118ab2'
        : '#d1d5db')
      .style('cursor', d => (d.id === focalId || relatedMap.has(d.id)) ? 'pointer' : 'default')
      .on('mouseenter', (event: MouseEvent, d: DocNode) => {
        setTooltip({
          clientX: event.clientX,
          clientY: event.clientY,
          doc: d,
          isFocal: d.id === focalId,
          relInfo: relInfoMap.get(d.id) ?? null,
        })
      })
      .on('mousemove', (event: MouseEvent) => {
        setTooltip(prev => prev ? { ...prev, clientX: event.clientX, clientY: event.clientY } : null)
      })
      .on('mouseleave', () => setTooltip(null))

    if (focalDoc) {
      dotG.append('circle')
        .attr('cx', xScale(focalDoc.pca_x)).attr('cy', yScale(focalDoc.pca_y))
        .attr('r', 11).attr('fill', 'none').attr('stroke', '#F4A124').attr('stroke-width', 2)
        .attr('pointer-events', 'none')
    }
  }, [detail, allDocs])

  return (
    <div style={{ position: 'relative', background: '#fafbfc', borderRadius: 8 }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: 120, display: 'block', borderRadius: '8px 8px 0 0' }}
      />
      {relatedDocs.length > 0 && (
        <div style={{
          borderTop: '1px solid rgba(7,59,76,0.1)',
          maxHeight: 72,
          overflowY: 'auto',
          padding: '4px 8px',
          background: '#fafbfc',
          borderRadius: '0 0 8px 8px',
        }}>
          {relatedDocs.map(d => (
            <div key={d.id} style={{
              fontSize: 9, color: '#374151', lineHeight: 1.5,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {d.title}
            </div>
          ))}
        </div>
      )}

      {tooltip && createPortal(
        <div className="card" style={{
          position: 'fixed',
          left: tooltip.clientX + 14,
          top: tooltip.clientY - 14,
          zIndex: 9999,
          padding: '8px 11px',
          maxWidth: 220,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#073b4c', marginBottom: 3, lineHeight: 1.3 }}>
            {tooltip.doc.title}
          </div>

          {tooltip.isFocal && (
            <div style={{ fontSize: 10, color: '#F4A124', fontWeight: 600, marginBottom: 4 }}>
              Source document
            </div>
          )}

          {!tooltip.isFocal && tooltip.relInfo && (
            <div style={{ marginBottom: 4 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                color: RELATION_COLORS[tooltip.relInfo.group], display: 'block', marginBottom: 2,
              }}>
                {tooltip.relInfo.group}
              </span>
              {tooltip.relInfo.relations.map((r, i) => (
                <div key={i} style={{ fontSize: 10, color: '#6b7280', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>{r.type.replace(/_/g, ' ').toLowerCase()}</span>
                  <span style={{ color: '#9ca3af' }}>{r.confidence.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {!tooltip.isFocal && !tooltip.relInfo && (
            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>Not directly related</div>
          )}

          <div style={{ fontSize: 10, color: '#9ca3af', borderTop: '1px solid rgba(7,59,76,0.06)', paddingTop: 4, marginTop: 2 }}>
            {tooltip.doc.citations} citations · {tooltip.doc.argument_count} arguments
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

