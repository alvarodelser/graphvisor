import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import * as d3 from 'd3'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import type { ArgumentDetail, DocNode } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  allDocs: DocNode[]
  isActive: boolean
}

interface TooltipState {
  clientX: number
  clientY: number
  doc: DocNode
  isFocal: boolean
  relInfo: { group: string; relations: { type: string; confidence: number }[] } | null
}

export function DetailMiniMap({ detail, allDocs, isActive }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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
          .attr('x1', xScale(focalDoc.umap_x)).attr('y1', yScale(focalDoc.umap_y))
          .attr('x2', xScale(target.umap_x)).attr('y2', yScale(target.umap_y))
          .attr('stroke', RELATION_COLORS[rel.group])
          .attr('stroke-width', Math.max(0.5, rel.confidence * 1.5))
          .attr('opacity', 0.65)
      })
    }

    const dotG = svg.append('g')
    dotG.selectAll<SVGCircleElement, DocNode>('circle')
      .data(allDocs)
      .join('circle')
      .attr('cx', d => xScale(d.umap_x))
      .attr('cy', d => yScale(d.umap_y))
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
        .attr('cx', xScale(focalDoc.umap_x)).attr('cy', yScale(focalDoc.umap_y))
        .attr('r', 11).attr('fill', 'none').attr('stroke', '#F4A124').attr('stroke-width', 2)
        .attr('pointer-events', 'none')
    }
  }, [detail, allDocs])

  const legendContent = (
    <>
      <div>
        <div className="sl">Documents</div>
        <div style={row}><span style={{ ...dot, background: '#F4A124', width: 14, height: 14, borderRadius: '50%' }} /><span style={text}>Focal document</span></div>
        <div style={row}><span style={{ ...dot, background: '#118ab2', width: 8, height: 8, borderRadius: '50%' }} /><span style={text}>Related document</span></div>
        <div style={row}><span style={{ ...dot, background: '#d1d5db', width: 4, height: 4, borderRadius: '50%' }} /><span style={text}>Unrelated document</span></div>
      </div>
      <div>
        <div className="sl">Relation lines</div>
        {(['positive', 'negative', 'causal'] as const).map(g => (
          <div key={g} style={row}>
            <span style={{ width: 20, height: 3, background: RELATION_COLORS[g], borderRadius: 2, flexShrink: 0 }} />
            <span style={{ ...text, textTransform: 'capitalize' }}>{g}</span>
          </div>
        ))}
        <div style={{ ...text, color: '#9ca3af', marginTop: 4 }}>Line weight = confidence</div>
      </div>
      <div>
        <div className="sl">Layout</div>
        <div style={{ ...text, color: '#6b7280', lineHeight: 1.6 }}>
          <div>Positions = UMAP embedding</div>
          <div>Hover dots for details</div>
        </div>
      </div>
    </>
  )

  return (
    <div style={{ position: 'relative', background: '#fafbfc', borderRadius: 8 }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: 180, display: 'block', borderRadius: 8 }}
      />
      <ControlPanel
        isActive={isActive}
        legendContent={legendContent}
        fabBottom={8}
        fabLeft={8}
      />

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
            {tooltip.doc.page_count} pages · {tooltip.doc.argument_count} arguments
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }
const dot: React.CSSProperties = { display: 'inline-block', flexShrink: 0 }
const text: React.CSSProperties = { fontSize: 11, color: '#374151' }
