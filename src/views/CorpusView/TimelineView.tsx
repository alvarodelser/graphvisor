import { useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react'
import * as d3 from 'd3'
import { useStore } from '../../store/useStore'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { CorpusStatsPanel } from './CorpusStatsPanel'
import { makeYearScale } from './yearAxis'
import { computeBeeswarm } from './beeswarm'
import type { DocNode } from '../../types'

interface Props {
  docs: DocNode[]
  selectedIds: Set<string>
}

const PAD_LEFT = 32
const PAD_RIGHT = 88
const SELECTED = '#ef476f'
const UNSELECTED = '#74b9d6'

export function TimelineView({ docs, selectedIds }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(0)
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const { selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection, sizeBy } = useStore()

  const BEESWARM_H = 200
  const STATS_H = 220

  useLayoutEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setWidth(wrapRef.current!.clientWidth))
    ro.observe(wrapRef.current)
    setWidth(wrapRef.current.clientWidth)
    return () => ro.disconnect()
  }, [])

  const years = useMemo(() => docs.map(d => d.year), [docs])
  const yearScale = useMemo(
    () => makeYearScale(years.length ? years : [2000], PAD_LEFT, Math.max(PAD_LEFT + 1, width - PAD_RIGHT)),
    [years, width],
  )

  const sizeScale = useMemo(() => {
    if (sizeBy === 'uniform') return () => 6
    const vals = docs.map(d => sizeBy === 'argument_count' ? d.argument_count : d.citations)
    const ext = d3.extent(vals) as [number, number]
    const s = d3.scaleLinear().domain(ext[0] === ext[1] ? [0, ext[1] || 1] : ext).range([4, 9])
    return (d: DocNode) => s(sizeBy === 'argument_count' ? d.argument_count : d.citations)
  }, [docs, sizeBy])

  const layout = useMemo(
    () => computeBeeswarm(
      docs.map(d => ({ id: d.id, year: d.year })),
      { xOf: (y) => yearScale.scale(y), centerY: BEESWARM_H / 2, radius: 7 },
    ),
    [docs, yearScale],
  )

  useEffect(() => {
    if (!svgRef.current || width === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    svg.append('g').selectAll('circle')
      .data(docs, (d: any) => d.id)
      .join('circle')
      .attr('cx', d => layout.get(d.id)?.x ?? 0)
      .attr('cy', d => layout.get(d.id)?.y ?? BEESWARM_H / 2)
      .attr('r', d => sizeScale(d))
      .attr('fill', d => selectedIds.has(d.id) ? SELECTED : UNSELECTED)
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent, d) => {
        event.stopPropagation()
        if (event.shiftKey) toggleDocumentSelection(d.id)
        else setSelectedDocuments(selectedDocumentIds.includes(d.id) ? [] : [d.id])
      })
      .on('mouseenter', (event: MouseEvent, d) => setTooltip({ doc: d, x: event.clientX, y: event.clientY }))
      .on('mouseleave', () => setTooltip(null))

    // baseline ticks at each real year
    const axis = svg.append('g').attr('transform', `translate(0,${BEESWARM_H - 1})`)
    axis.call(d3.axisBottom(d3.scaleLinear().domain(yearScale.domain).range([yearScale.scale(yearScale.domain[0]), yearScale.scale(yearScale.domain[1])]))
      .tickValues([...new Set(years)].sort((a, b) => a - b)).tickFormat(d => String(d)).tickSize(3))
      .call(g => {
        g.select('.domain').attr('stroke', 'rgba(7,59,76,0.12)')
        g.selectAll('.tick text').attr('font-size', 9).attr('fill', '#9ca3af')
      })
  }, [docs, layout, sizeScale, selectedIds, width, years, yearScale, selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection])

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, paddingTop: 56, background: '#fafbfc', overflow: 'hidden' }}>
      <svg ref={svgRef} style={{ width: '100%', height: BEESWARM_H, display: 'block' }} />
      <CorpusStatsPanel docs={docs} height={STATS_H} xScale={yearScale.scale} padLeft={PAD_LEFT} padRight={PAD_RIGHT} />
      {tooltip && (
        <FloatingCard style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>{tooltip.doc.title}</div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>
            {tooltip.doc.year} · {tooltip.doc.citations} citations · {tooltip.doc.argument_count} arguments
          </div>
        </FloatingCard>
      )}
    </div>
  )
}
