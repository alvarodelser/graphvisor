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
// Space reserved for the switcher pill + chip label below it
const HEADER_H = 82
// Persistent horizontal range-selector bar (shows selected year blocks)
const RANGE_BAR_H = 20
const BEESWARM_H = 200
const AXIS_H = 28
const STATS_H = 220
const SELECTED = '#ef476f'
const UNSELECTED = '#74b9d6'

export function TimelineView({ docs, selectedIds }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // Drag-range overlay div — updated directly via style to avoid React re-renders during drag
  const dragOverlayRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const [hoveredYear, setHoveredYear] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection, sizeBy } = useStore()

  useLayoutEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver(() => setWidth(wrapRef.current!.clientWidth))
    ro.observe(wrapRef.current)
    setWidth(wrapRef.current.clientWidth)
    return () => ro.disconnect()
  }, [])

  const years = useMemo(() => docs.map(d => d.year), [docs])
  const uniqueYears = useMemo(() => [...new Set(years)].sort((a, b) => a - b), [years])

  // Full contiguous range min → max
  const allYears = useMemo(() => {
    if (uniqueYears.length === 0) return []
    const min = uniqueYears[0]
    const max = uniqueYears[uniqueYears.length - 1]
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }, [uniqueYears])

  const yearScale = useMemo(
    () => makeYearScale(years.length ? years : [2000], PAD_LEFT, Math.max(PAD_LEFT + 1, width - PAD_RIGHT)),
    [years, width],
  )

  // Pixel width of a single year column
  const colW = useMemo(() => {
    const [min, max] = yearScale.domain
    const span = max - min
    return span > 0 ? (width - PAD_LEFT - PAD_RIGHT) / span : 30
  }, [yearScale, width])

  // Label every N years to avoid overcrowding
  const yearLabelStep = useMemo(() => {
    if (colW >= 20) return 1
    if (colW >= 10) return 2
    if (colW >= 5) return 5
    return 10
  }, [colW])

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

  const selectedYearSet = useMemo(() => {
    const s = new Set<number>()
    docs.forEach(d => { if (selectedIds.has(d.id)) s.add(d.year) })
    return s
  }, [docs, selectedIds])

  // Stable refs so drag callbacks never go stale
  const selectedDocumentIdsRef = useRef(selectedDocumentIds)
  selectedDocumentIdsRef.current = selectedDocumentIds
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds
  const docsRef = useRef(docs)
  docsRef.current = docs

  useEffect(() => {
    if (!svgRef.current || width === 0) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Selected-year bands (behind circles)
    if (selectedYearSet.size > 0) {
      const hl = svg.append('g').attr('pointer-events', 'none')
      selectedYearSet.forEach(year => {
        hl.append('rect')
          .attr('x', yearScale.scale(year) - colW / 2)
          .attr('width', colW)
          .attr('y', 0).attr('height', BEESWARM_H)
          .attr('fill', SELECTED).attr('opacity', 0.1)
      })
    }

    // Document circles
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
        else setSelectedDocuments(selectedDocumentIdsRef.current.includes(d.id) ? [] : [d.id])
      })
      .on('mouseenter', (event: MouseEvent, d) => setTooltip({ doc: d, x: event.clientX, y: event.clientY }))
      .on('mouseleave', () => setTooltip(null))

    // Drag selection band inside the beeswarm SVG
    const selectionBand = svg.append('rect')
      .attr('y', 0).attr('height', BEESWARM_H)
      .attr('fill', '#073b4c').attr('opacity', 0)
      .attr('pointer-events', 'none')

    const [yMin, yMax] = yearScale.domain
    const span = yMax - yMin
    const left = PAD_LEFT
    const right = width - PAD_RIGHT
    const invertYear = (px: number) =>
      span === 0 ? yMin : yMin + (px - left) / (right - left) * span

    let dragStartX = 0
    let dragMode: 'replace' | 'add' | 'deselect' = 'replace'
    let dragActive = false

    const dragBehavior = d3.drag<SVGRectElement, unknown>()
      .on('start', function(event) {
        const mx = d3.pointer(event, this)[0]
        dragStartX = mx
        dragActive = false
        setIsDragging(true)

        const startYear = Math.round(invertYear(mx))
        const docsAtYear = docsRef.current.filter(d => d.year === startYear)
        const allSelected = docsAtYear.length > 0 && docsAtYear.every(d => selectedIdsRef.current.has(d.id))

        if ((event.sourceEvent as MouseEvent).shiftKey && allSelected) dragMode = 'deselect'
        else if ((event.sourceEvent as MouseEvent).shiftKey) dragMode = 'add'
        else dragMode = 'replace'
      })
      .on('drag', function(event) {
        const mx = d3.pointer(event, this)[0]
        if (!dragActive && Math.abs(mx - dragStartX) > 4) dragActive = true
        if (!dragActive) return

        const x0 = Math.min(dragStartX, mx)
        const x1 = Math.max(dragStartX, mx)
        selectionBand.attr('x', x0).attr('width', x1 - x0).attr('opacity', 0.08)

        // Update full-height overlay directly via DOM ref (no React re-render)
        if (dragOverlayRef.current) {
          dragOverlayRef.current.style.left = `${x0}px`
          dragOverlayRef.current.style.width = `${x1 - x0}px`
          dragOverlayRef.current.style.opacity = '1'
        }
      })
      .on('end', function(event) {
        selectionBand.attr('opacity', 0)
        if (dragOverlayRef.current) dragOverlayRef.current.style.opacity = '0'
        setIsDragging(false)

        if (!dragActive) { dragActive = false; return }
        dragActive = false

        const mx = d3.pointer(event, this)[0]
        const y0 = Math.round(invertYear(Math.min(dragStartX, mx)))
        const y1 = Math.round(invertYear(Math.max(dragStartX, mx)))
        const docsInRange = docsRef.current.filter(d => d.year >= y0 && d.year <= y1).map(d => d.id)
        const prev = selectedDocumentIdsRef.current

        if (dragMode === 'replace') setSelectedDocuments(docsInRange)
        else if (dragMode === 'add') setSelectedDocuments([...new Set([...prev, ...docsInRange])])
        else setSelectedDocuments(prev.filter(id => !docsInRange.includes(id)))
      })

    svg.append('rect')
      .attr('width', width).attr('height', BEESWARM_H)
      .attr('fill', 'transparent')
      .attr('cursor', 'crosshair')
      .on('mousemove', function(event: MouseEvent) {
        const [mx] = d3.pointer(event, this as SVGRectElement)
        setHoveredYear(Math.round(invertYear(mx)))
      })
      .on('mouseleave', () => setHoveredYear(null))
      .call(dragBehavior as any)

  }, [docs, layout, sizeScale, selectedIds, selectedYearSet, colW, width, yearScale,
      setSelectedDocuments, toggleDocumentSelection, setIsDragging])

  const crosshairX = hoveredYear !== null ? yearScale.scale(hoveredYear) : null
  const overlayH = RANGE_BAR_H + BEESWARM_H + AXIS_H + STATS_H

  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, paddingTop: HEADER_H, background: '#fafbfc', overflow: 'hidden' }}>

      {/* ── Persistent range bar ─────────────────────────────────────────────── */}
      {width > 0 && (
        <svg style={{ width: '100%', height: RANGE_BAR_H, display: 'block' }}>
          {/* Track background */}
          <rect
            x={PAD_LEFT} y={4}
            width={width - PAD_LEFT - PAD_RIGHT}
            height={RANGE_BAR_H - 8}
            fill="rgba(7,59,76,0.05)" rx={3}
          />
          {/* Selected-year filled blocks */}
          {allYears.filter(y => selectedYearSet.has(y)).map(year => (
            <rect
              key={year}
              x={yearScale.scale(year) - colW / 2} width={colW}
              y={2} height={RANGE_BAR_H - 4}
              fill={SELECTED} opacity={0.45} rx={1}
            />
          ))}
          {/* Year tick marks at both edges of the track */}
          <line x1={PAD_LEFT} y1={4} x2={PAD_LEFT} y2={RANGE_BAR_H - 4}
            stroke="rgba(7,59,76,0.15)" strokeWidth={1} />
          <line x1={width - PAD_RIGHT} y1={4} x2={width - PAD_RIGHT} y2={RANGE_BAR_H - 4}
            stroke="rgba(7,59,76,0.15)" strokeWidth={1} />
          {uniqueYears.length > 0 && (
            <>
              <text x={PAD_LEFT + 3} y={RANGE_BAR_H - 5} fontSize={8} fill="rgba(7,59,76,0.35)"
                style={{ fontFamily: 'system-ui, sans-serif' }}>
                {uniqueYears[0]}
              </text>
              <text x={width - PAD_RIGHT - 3} y={RANGE_BAR_H - 5} fontSize={8} fill="rgba(7,59,76,0.35)"
                textAnchor="end" style={{ fontFamily: 'system-ui, sans-serif' }}>
                {uniqueYears[uniqueYears.length - 1]}
              </text>
            </>
          )}
          {/* Hovered-year indicator */}
          {hoveredYear !== null && (
            <line
              x1={yearScale.scale(hoveredYear)} x2={yearScale.scale(hoveredYear)}
              y1={0} y2={RANGE_BAR_H}
              stroke="rgba(7,59,76,0.4)" strokeWidth={1.5}
            />
          )}
        </svg>
      )}

      {/* ── Beeswarm ─────────────────────────────────────────────────────────── */}
      <svg ref={svgRef} style={{ width: '100%', height: BEESWARM_H, display: 'block' }} />

      {/* ── Shared year axis ─────────────────────────────────────────────────── */}
      {width > 0 && (
        <svg style={{ width: '100%', height: AXIS_H, display: 'block', overflow: 'visible' }}>
          {allYears.filter(y => selectedYearSet.has(y)).map(year => (
            <rect key={`sel-${year}`}
              x={yearScale.scale(year) - colW / 2} width={colW}
              y={0} height={AXIS_H}
              fill={SELECTED} opacity={0.07}
            />
          ))}
          {allYears.map(year => {
            const x = yearScale.scale(year)
            const active = year === hoveredYear
            const showLabel = year % yearLabelStep === 0 || active
            return (
              <g key={year} transform={`translate(${x},0)`}>
                <line y1={0} y2={active ? 8 : 4}
                  stroke={active ? '#073b4c' : 'rgba(7,59,76,0.2)'}
                  strokeWidth={active ? 1.5 : 1} />
                {showLabel && (
                  <text y={19} textAnchor="middle"
                    fontSize={active ? 10 : 9}
                    fontWeight={active ? 700 : 400}
                    fill={active ? '#073b4c' : '#9ca3af'}
                    style={{ fontFamily: 'system-ui, sans-serif' }}>
                    {year}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}

      <CorpusStatsPanel
        docs={docs}
        height={STATS_H}
        xScale={yearScale.scale}
        padLeft={PAD_LEFT}
        padRight={PAD_RIGHT}
        onHoverYear={setHoveredYear}
        disabled={isDragging}
      />

      {/* ── Full-height drag range overlay (DOM-managed, zero React re-renders) ─ */}
      <div ref={dragOverlayRef} style={{
        position: 'absolute',
        top: HEADER_H,
        height: overlayH,
        background: 'rgba(7,59,76,0.07)',
        pointerEvents: 'none',
        zIndex: 3,
        opacity: 0,
        left: 0, width: 0,
      }} />

      {/* ── Crosshair (single pixel, full height) ────────────────────────────── */}
      {crosshairX !== null && (
        <div style={{
          position: 'absolute',
          left: crosshairX,
          top: HEADER_H,
          height: overlayH,
          width: 1,
          background: 'rgba(7,59,76,0.2)',
          pointerEvents: 'none',
          zIndex: 4,
        }} />
      )}

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
