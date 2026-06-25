import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { ArgumentBlob } from '../../types'
import styles from './GraphMiniMap.module.css'

export interface ZoomState { k: number; x: number; y: number }

interface Props {
  blobs: ArgumentBlob[]
  blobCentroidsRef: RefObject<Map<string, { x: number; y: number }>>
  zoomState: ZoomState
  svgWidth: number
  svgHeight: number
  highlightedBlobIds?: Set<string>
  onPanTo: (graphX: number, graphY: number) => void
  onClose: () => void
}

const MAX_DOTS = 300

export function GraphMiniMap({ blobs, blobCentroidsRef, zoomState, svgWidth, svgHeight, highlightedBlobIds, onPanTo, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const scaleRef = useRef<{ xScale: d3.ScaleLinear<number, number>; yScale: d3.ScaleLinear<number, number> } | null>(null)
  const viewportRef = useRef<d3.Selection<SVGRectElement, unknown, null, undefined> | null>(null)
  const [isReady, setIsReady] = useState(false)

  const size = svgWidth >= 1400 ? 280 : 140
  const show = svgWidth >= 500 && blobs.length > 0

  // Full redraw when blobs, size, or highlights change
  useEffect(() => {
    if (!svgRef.current || !show) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    scaleRef.current = null
    viewportRef.current = null

    const centroids = blobCentroidsRef.current
    if (!centroids || centroids.size === 0) { setIsReady(false); return }

    const points: { id: string; x: number; y: number; n: number }[] = []
    for (const blob of blobs) {
      const pos = centroids.get(blob.id)
      if (pos) points.push({ id: blob.id, x: pos.x, y: pos.y, n: blob.entityIds.length })
    }
    if (points.length === 0) { setIsReady(false); return }

    const pad = 8
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xPad = (xMax - xMin) * 0.12 || 80
    const yPad = (yMax - yMin) * 0.12 || 80

    const xScale = d3.scaleLinear().domain([xMin - xPad, xMax + xPad]).range([pad, size - pad])
    const yScale = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([pad, size - pad])
    scaleRef.current = { xScale, yScale }

    const maxN = Math.max(1, ...points.map(p => p.n))
    const highlighted = highlightedBlobIds ?? new Set<string>()
    const highlightedPoints = points.filter(p => highlighted.has(p.id))
    const normalPoints = points.filter(p => !highlighted.has(p.id))
    const displayNormal = normalPoints.length > MAX_DOTS
      ? normalPoints.filter((_, i) => i % Math.ceil(normalPoints.length / MAX_DOTS) === 0)
      : normalPoints

    svg.append('g')
      .selectAll('circle').data(displayNormal).join('circle')
      .attr('cx', p => xScale(p.x)).attr('cy', p => yScale(p.y))
      .attr('r', 2.5).attr('fill', '#073b4c')
      .attr('opacity', p => 0.2 + 0.8 * (p.n / maxN))
      .attr('pointer-events', 'none')

    if (highlightedPoints.length > 0) {
      svg.append('g')
        .selectAll('circle').data(highlightedPoints).join('circle')
        .attr('cx', p => xScale(p.x)).attr('cy', p => yScale(p.y))
        .attr('r', 4.5).attr('fill', '#ef476f').attr('opacity', 0.95)
        .attr('pointer-events', 'none')
    }

    viewportRef.current = svg.append('rect')
      .attr('fill', 'rgba(244,161,36,0.10)')
      .attr('stroke', '#F4A124').attr('stroke-width', 1.2)
      .attr('rx', 1).attr('pointer-events', 'none') as unknown as d3.Selection<SVGRectElement, unknown, null, undefined>

    setIsReady(true)
  }, [blobs, size, show, highlightedBlobIds])

  // Update viewport rect position whenever transform or canvas size changes
  useEffect(() => {
    if (!viewportRef.current || !scaleRef.current) return
    const { xScale, yScale } = scaleRef.current
    const { k, x, y } = zoomState
    const gx0 = (0 - x) / k,       gy0 = (0 - y) / k
    const gx1 = (svgWidth - x) / k, gy1 = (svgHeight - y) / k
    const mx0 = xScale(gx0), my0 = yScale(gy0)
    const mx1 = xScale(gx1), my1 = yScale(gy1)
    viewportRef.current
      .attr('x', Math.min(mx0, mx1)).attr('y', Math.min(my0, my1))
      .attr('width', Math.max(1, Math.abs(mx1 - mx0)))
      .attr('height', Math.max(1, Math.abs(my1 - my0)))
  }, [zoomState, svgWidth, svgHeight, isReady])

  if (!show) return null

  const handleMouse = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.type === 'mousemove' && e.buttons !== 1) return
    if (!scaleRef.current || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    onPanTo(
      scaleRef.current.xScale.invert(e.clientX - rect.left),
      scaleRef.current.yScale.invert(e.clientY - rect.top),
    )
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: size,
      height: size,
      background: 'rgba(250,251,252,0.92)',
      border: '1px solid rgba(7,59,76,0.14)',
      borderRadius: 6,
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(7,59,76,0.10)',
      cursor: 'crosshair',
    }}>
      {!isReady && <div className={styles.loading} />}
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseDown={handleMouse}
        onMouseMove={handleMouse}
      />
      <div style={{
        position: 'absolute',
        top: 5,
        left: 0,
        width: size,
        textAlign: 'center',
        fontSize: 8,
        fontWeight: 800,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'rgba(7,59,76,0.25)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        Minimap
      </div>
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 3, right: 5,
          width: 16, height: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, fontSize: 14, lineHeight: 1,
          color: 'rgba(7,59,76,0.3)',
        }}
        title="Hide minimap"
        aria-label="Hide minimap"
      >×</button>
    </div>
  )
}
