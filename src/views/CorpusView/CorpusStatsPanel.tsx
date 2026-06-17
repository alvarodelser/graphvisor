import { useRef, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import * as d3 from 'd3'
import type { DocNode } from '../../types'

interface Props {
  docs: DocNode[]
  height: number
  /** Optional external x mapping so the timeline beeswarm and stream align. */
  xScale?: (year: number) => number
  padLeft?: number
  padRight?: number
  onHoverYear?: (year: number | null) => void
  disabled?: boolean
}

interface TooltipState {
  clientX: number
  clientY: number
  year: number
  items: { term: string; val: number; color: string }[]
}

const N_FINE = 300

const PALETTE = [
  '#118ab2', '#ef476f', '#06d6a0', '#ffd166',
  '#F4A124', '#74b9d6', '#073b4c', '#64748b',
]

// Fritsch-Carlson monotone cubic spline — smooth, no oscillation, matches d3.curveMonotoneX
function makeSpline(pts: { x: number; val: number }[]): (x: number) => number {
  const n = pts.length
  if (n === 0) return () => 0
  if (n === 1) return () => pts[0].val

  const d: number[] = []
  for (let i = 0; i < n - 1; i++)
    d[i] = (pts[i + 1].val - pts[i].val) / (pts[i + 1].x - pts[i].x)

  const m: number[] = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++)
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2

  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b
    if (h > 9) { const tau = 3 / Math.sqrt(h); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i] }
  }

  return (x: number): number => {
    if (x <= pts[0].x) return pts[0].val
    if (x >= pts[n - 1].x) return pts[n - 1].val
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].x <= x) lo = mid; else hi = mid }
    const h = pts[hi].x - pts[lo].x, t = (x - pts[lo].x) / h
    const t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * pts[lo].val + (t3 - 2 * t2 + t) * h * m[lo]
         + (-2 * t3 + 3 * t2) * pts[hi].val + (t3 - t2) * h * m[hi + 1 < n ? hi : hi]
  }
}

export function CorpusStatsPanel({ docs, height, xScale: extXScale, padLeft, padRight, onHoverYear, disabled }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const onHoverYearRef = useRef(onHoverYear)
  onHoverYearRef.current = onHoverYear

  const terms = useMemo(() => {
    const counts: Record<string, number> = {}
    docs.forEach(d =>
      Object.entries(d.termCounts).forEach(([t, n]) => {
        counts[t] = (counts[t] || 0) + n
      })
    )
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t)
  }, [docs])

  const years = useMemo(
    () => [...new Set(docs.map(d => d.year))].sort((a, b) => a - b),
    [docs]
  )

  const yearTermCounts = useMemo(() => {
    const map = new Map<number, Record<string, number>>()
    docs.forEach(d => {
      if (!map.has(d.year)) map.set(d.year, {})
      const entry = map.get(d.year)!
      Object.entries(d.termCounts).forEach(([t, n]) => {
        entry[t] = (entry[t] || 0) + n
      })
    })
    return map
  }, [docs])

  useEffect(() => {
    if (!svgRef.current || terms.length === 0 || years.length < 2) return
    const el = svgRef.current

    function draw() {
    const { width } = el.getBoundingClientRect()
    if (width < 40) return

    const PAD = {
      top: 12, bottom: 6,
      left: padLeft ?? 32,
      right: padRight ?? 88,
    }
    const chartW = width  - PAD.left - PAD.right
    const chartH = height - PAD.top  - PAD.bottom

    const yearStart = years[0]
    const yearEnd   = years[years.length - 1]

    const svg = d3.select(el)
    svg.selectAll('*').remove()

    const xs = Array.from({ length: N_FINE }, (_, i) =>
      yearStart + i * (yearEnd - yearStart) / (N_FINE - 1)
    )

    const series = terms.map((term, i) => {
      const pts = years.map(y => ({ x: y, val: yearTermCounts.get(y)?.[term] ?? 0 }))
      const spline = makeSpline(pts)
      return {
        term,
        color: PALETTE[i % PALETTE.length],
        spline,
        vals: xs.map(x => Math.max(0, spline(x))),
      }
    })

    const yMax = d3.max(series, s => d3.max(s.vals) ?? 0) ?? 1
    const xScale = extXScale
      ? d3.scaleLinear()
          .domain([yearStart, yearEnd])
          .range([extXScale(yearStart) - PAD.left, extXScale(yearEnd) - PAD.left])
      : d3.scaleLinear().domain([yearStart, yearEnd]).range([0, chartW])
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

    // Right-edge labels — collision-resolved
    const MIN_GAP = 13
    const labelItems = series
      .map(s => ({ term: s.term, color: s.color, idealY: yScale(s.vals[N_FINE - 1]) }))
      .sort((a, b) => a.idealY - b.idealY)
    const pos = labelItems.map(l => l.idealY)

    for (let iter = 0; iter < 200; iter++) {
      let moved = false
      for (let i = 1; i < pos.length; i++) {
        if (pos[i] - pos[i - 1] < MIN_GAP) {
          const mid = (pos[i] + pos[i - 1]) / 2
          pos[i - 1] = mid - MIN_GAP / 2
          pos[i]     = mid + MIN_GAP / 2
          moved = true
        }
      }
      // clamp to chart
      if (pos[0] < 4) { const shift = 4 - pos[0]; pos.forEach((_, j) => { pos[j] += shift }) }
      if (pos[pos.length - 1] > chartH - 4) { const shift = pos[pos.length - 1] - (chartH - 4); pos.forEach((_, j) => { pos[j] -= shift }) }
      if (!moved) break
    }

    labelItems.forEach((l, i) => {
      const labelY = pos[i]
      const anchorY = l.idealY
      // connector from curve end to label if they diverged
      if (Math.abs(labelY - anchorY) > 3) {
        chart.append('path')
          .attr('d', `M${chartW + 1},${anchorY} C${chartW + 5},${anchorY} ${chartW + 5},${labelY} ${chartW + 8},${labelY}`)
          .attr('fill', 'none')
          .attr('stroke', l.color)
          .attr('stroke-width', 0.8)
          .attr('opacity', 0.5)
      }
      chart.append('text')
        .attr('x', chartW + (Math.abs(labelY - anchorY) > 3 ? 10 : 6))
        .attr('y', labelY + 4)
        .attr('font-size', 10).attr('font-weight', 600)
        .attr('fill', l.color).attr('font-family', 'system-ui, sans-serif')
        .text(l.term)
    })

    // Y axis
    chart.append('g')
      .call(d3.axisLeft(yScale).ticks(3).tickFormat(() => ''))
      .call(g => { g.select('.domain').remove(); g.selectAll('.tick line').attr('stroke', 'rgba(7,59,76,0.1)').attr('x2', -4) })

    svg.append('text')
      .attr('x', PAD.left).attr('y', 9)
      .attr('font-size', 8).attr('font-weight', 700).attr('letter-spacing', '0.09em')
      .attr('fill', 'rgba(7,59,76,0.28)').attr('font-family', 'system-ui, sans-serif')
      .text('CONCEPT MENTIONS BY YEAR')

    // ── Hover dots + tooltip — snapped to nearest year ──────────────────────
    const dots = series.map(s =>
      chart.append('circle')
        .attr('r', 3).attr('fill', s.color).attr('stroke', '#fff').attr('stroke-width', 1.5)
        .attr('pointer-events', 'none').attr('opacity', 0)
    )

    chart.append('rect')
      .attr('width', chartW).attr('height', chartH)
      .attr('fill', 'transparent').attr('cursor', 'default')
      .on('mousemove', function(event: MouseEvent) {
        const [mx] = d3.pointer(event, this as SVGRectElement)
        const xi = Math.max(0, Math.min(N_FINE - 1,
          Math.round((xScale.invert(mx) - yearStart) / (yearEnd - yearStart) * (N_FINE - 1))
        ))
        const snappedYear = Math.round(xs[xi])
        const snappedX = xScale(snappedYear)
        dots.forEach((dot, i) => {
          dot.attr('cx', snappedX).attr('cy', yScale(series[i].vals[xi])).attr('opacity', 1)
        })
        onHoverYearRef.current?.(snappedYear)
        setTooltip({
          clientX: event.clientX,
          clientY: event.clientY,
          year: snappedYear,
          items: series
            .map(s => ({ term: s.term, val: Math.max(0, s.spline(xs[xi])), color: s.color }))
            .sort((a, b) => b.val - a.val),
        })
      })
      .on('mouseleave', () => {
        dots.forEach(d => d.attr('opacity', 0))
        onHoverYearRef.current?.(null)
        setTooltip(null)
      })
    } // close draw()

    draw()

    const ro = new ResizeObserver(draw)
    ro.observe(el)
    return () => ro.disconnect()
  }, [terms, years, yearTermCounts, height, extXScale, padLeft, padRight])

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
      <svg ref={svgRef} style={{ width: '100%', height, display: 'block', pointerEvents: disabled ? 'none' : undefined }} />

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
                <div style={{ height: '100%', width: `${maxVal > 0 ? (item.val / maxVal) * 100 : 0}%`, background: item.color, borderRadius: 2, transition: 'width 0.1s' }} />
              </div>
              <span style={{ fontSize: 9, color: '#9ca3af', width: 28, textAlign: 'right', flexShrink: 0 }}>
                {item.val.toFixed(1)}
              </span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
