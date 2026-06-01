import { useRef, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import * as d3 from 'd3'
import type { DocNode } from '../../types'

interface Props {
  docs: DocNode[]
  height: number
}

interface TooltipState {
  clientX: number
  clientY: number
  year: number
  items: { term: string; val: number; color: string }[]
}

const YEAR_START = 2014
const YEAR_END   = 2024
const N_FINE     = 300

const PALETTE = [
  '#118ab2', '#ef476f', '#06d6a0', '#ffd166',
  '#F4A124', '#74b9d6', '#073b4c', '#64748b',
]

function mockFreq(term: string, x: number): number {
  let h = 0
  for (const c of term) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  const peak      = YEAR_START + (Math.abs(h) % (YEAR_END - YEAR_START - 1))
  const amplitude = 0.22 + (Math.abs(h >> 4) % 7) * 0.06
  const slope     = ((Math.abs(h >> 8) % 3) - 1) * 0.016
  const freq      = Math.exp(-Math.pow(x - peak, 2) / 14) * amplitude
  const noise     = Math.sin(x * ((Math.abs(h) % 9) + 2) * 1.3) * 0.022
  return Math.max(0, Math.min(0.95, freq + slope * (x - YEAR_START) + noise))
}

export function CorpusStatsPanel({ docs, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const terms = useMemo(() => {
    const counts: Record<string, number> = {}
    docs.forEach(d => d.top_terms.forEach(t => { counts[t] = (counts[t] || 0) + 1 }))
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t)
  }, [docs])

  useEffect(() => {
    if (!svgRef.current || terms.length === 0) return
    const el = svgRef.current
    const { width } = el.getBoundingClientRect()
    if (width < 40) return

    const PAD = { top: 12, bottom: 24, left: 32, right: 88 }
    const chartW = width  - PAD.left - PAD.right
    const chartH = height - PAD.top  - PAD.bottom

    const svg = d3.select(el)
    svg.selectAll('*').remove()

    const xs = Array.from({ length: N_FINE }, (_, i) =>
      YEAR_START + i * (YEAR_END - YEAR_START) / (N_FINE - 1)
    )

    const series = terms.map((term, i) => ({
      term,
      color: PALETTE[i % PALETTE.length],
      vals: xs.map(x => mockFreq(term, x)),
    }))

    const yMax = d3.max(series, s => d3.max(s.vals) ?? 0) ?? 1
    const xScale = d3.scaleLinear().domain([YEAR_START, YEAR_END]).range([0, chartW])
    const yScale = d3.scaleLinear().domain([0, yMax * 1.12]).range([chartH, 0])

    const chart = svg.append('g').attr('transform', `translate(${PAD.left},${PAD.top})`)

    // Grid
    chart.append('g')
      .selectAll('line')
      .data(yScale.ticks(4))
      .join('line')
      .attr('x1', 0).attr('x2', chartW)
      .attr('y1', d => yScale(d)).attr('y2', d => yScale(d))
      .attr('stroke', 'rgba(7,59,76,0.06)')
      .attr('stroke-dasharray', '3 4')

    // Exclusive band areas
    series.forEach((s, si) => {
      const bandData = xs.map((x, xi) => {
        const top = s.vals[xi]
        let bottom = 0
        for (let j = 0; j < series.length; j++) {
          if (j === si) continue
          const v = series[j].vals[xi]
          if (v < top && v > bottom) bottom = v
        }
        return { x, top, bottom }
      })
      chart.append('path')
        .datum(bandData)
        .attr('d', d3.area<typeof bandData[0]>()
          .x(d => xScale(d.x)).y1(d => yScale(d.top)).y0(d => yScale(d.bottom))
          .curve(d3.curveCatmullRom.alpha(0.5)))
        .attr('fill', s.color)
        .attr('opacity', 0.82)
    })

    // Lines
    series.forEach(s => {
      chart.append('path')
        .datum(xs.map((x, xi) => ({ x, val: s.vals[xi] })))
        .attr('d', d3.line<{ x: number; val: number }>()
          .x(d => xScale(d.x)).y(d => yScale(d.val))
          .curve(d3.curveCatmullRom.alpha(0.5)))
        .attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', 1.5)
    })

    // Right-edge labels
    series.forEach(s => {
      chart.append('text')
        .attr('x', chartW + 6).attr('y', yScale(s.vals[N_FINE - 1]) + 4)
        .attr('font-size', 10).attr('font-weight', 600)
        .attr('fill', s.color).attr('font-family', 'system-ui, sans-serif')
        .text(s.term)
    })

    // X axis
    chart.append('g')
      .attr('transform', `translate(0,${chartH})`)
      .call(d3.axisBottom(xScale)
        .tickValues(Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, i) => YEAR_START + i).filter(y => y % 2 === 0))
        .tickFormat(d => String(d)).tickSize(3))
      .call(g => {
        g.select('.domain').attr('stroke', 'rgba(7,59,76,0.12)')
        g.selectAll('.tick line').attr('stroke', 'rgba(7,59,76,0.1)')
        g.selectAll('.tick text').attr('font-size', 9).attr('fill', '#9ca3af').attr('dy', '1.3em')
      })

    // Y axis
    chart.append('g')
      .call(d3.axisLeft(yScale).ticks(3).tickFormat(() => ''))
      .call(g => { g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', 'rgba(7,59,76,0.1)').attr('x2', -4) })

    svg.append('text')
      .attr('x', PAD.left).attr('y', 9)
      .attr('font-size', 8).attr('font-weight', 700).attr('letter-spacing', '0.09em')
      .attr('fill', 'rgba(7,59,76,0.28)').attr('font-family', 'system-ui, sans-serif')
      .text('CONCEPT FREQUENCY OVER TIME')

    // ── Crosshair + tooltip interaction ──────────────────────────────────────
    const crosshair = chart.append('line')
      .attr('y1', 0).attr('y2', chartH)
      .attr('stroke', 'rgba(7,59,76,0.25)').attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3').attr('pointer-events', 'none').attr('opacity', 0)

    // Dot markers on lines (one per series, moved on hover)
    const dots = series.map(s =>
      chart.append('circle')
        .attr('r', 3).attr('fill', s.color).attr('stroke', '#fff').attr('stroke-width', 1.5)
        .attr('pointer-events', 'none').attr('opacity', 0)
    )

    chart.append('rect')
      .attr('width', chartW).attr('height', chartH)
      .attr('fill', 'transparent').attr('cursor', 'crosshair')
      .on('mousemove', function(event: MouseEvent) {
        const [mx] = d3.pointer(event, this as SVGRectElement)
        const xi = Math.max(0, Math.min(N_FINE - 1,
          Math.round((xScale.invert(mx) - YEAR_START) / (YEAR_END - YEAR_START) * (N_FINE - 1))
        ))
        const snappedX = xScale(xs[xi])
        crosshair.attr('x1', snappedX).attr('x2', snappedX).attr('opacity', 1)
        dots.forEach((dot, i) => {
          dot.attr('cx', snappedX).attr('cy', yScale(series[i].vals[xi])).attr('opacity', 1)
        })
        setTooltip({
          clientX: event.clientX,
          clientY: event.clientY,
          year: Math.round(xs[xi]),
          items: series
            .map(s => ({ term: s.term, val: s.vals[xi], color: s.color }))
            .sort((a, b) => b.val - a.val),
        })
      })
      .on('mouseleave', () => {
        crosshair.attr('opacity', 0)
        dots.forEach(d => d.attr('opacity', 0))
        setTooltip(null)
      })

  }, [terms, height])

  if (terms.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#9ca3af' }}>
        No documents selected
      </div>
    )
  }

  const maxVal = tooltip ? Math.max(...tooltip.items.map(i => i.val)) : 1

  return (
    <>
      <svg ref={svgRef} style={{ width: '100%', height, display: 'block' }} />

      {tooltip && createPortal(
        <div className="card" style={{
          position: 'fixed',
          left: tooltip.clientX + 14,
          top: tooltip.clientY - 30,
          zIndex: 9999,
          padding: '8px 10px',
          minWidth: 180,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 7, letterSpacing: '0.05em' }}>
            {tooltip.year}
          </div>
          {tooltip.items.map(item => (
            <div key={item.term} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#374151', width: 76, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.term}
              </span>
              <div style={{ flex: 1, height: 3, background: '#e5e7eb', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${(item.val / maxVal) * 100}%`, background: item.color, borderRadius: 2, transition: 'width 0.1s' }} />
              </div>
              <span style={{ fontSize: 9, color: '#9ca3af', width: 28, textAlign: 'right', flexShrink: 0 }}>
                {(item.val * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
