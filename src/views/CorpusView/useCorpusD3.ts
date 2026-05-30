import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { DocNode, SizeBy } from '../../types'
import { isPointInPolygon } from '../../utils/geometry'

interface Options {
  selectedIds: Set<string>
  sizeBy: SizeBy
  onLassoSelect: (ids: string[]) => void
  onClickToggle: (id: string, shiftKey: boolean) => void
  setTooltip: (t: { doc: DocNode; x: number; y: number } | null) => void
}

const CANVAS_BG = '#fafbfc'
const DOT_DEFAULT = '#74b9d6'
const DOT_SELECTED = '#ef476f'

export function useCorpusD3(
  svgRef: RefObject<SVGSVGElement | null>,
  docs: DocNode[],
  opts: Options
) {
  const simPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const optsRef = useRef(opts)
  optsRef.current = opts

  const xScaleRef = useRef<d3.ScaleLinear<number, number>>()
  const yScaleRef = useRef<d3.ScaleLinear<number, number>>()

  useEffect(() => {
    if (!svgRef.current || docs.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.style('background', CANVAS_BG)

    const pad = 60
    // Always UMAP — projection toggle removed
    const xScale = d3.scaleLinear()
      .domain(d3.extent(docs, d => d.umap_x) as [number, number]).range([pad, width - pad])
    const yScale = d3.scaleLinear()
      .domain(d3.extent(docs, d => d.umap_y) as [number, number]).range([height - pad, pad])
    xScaleRef.current = xScale
    yScaleRef.current = yScale

    const sizeVals = docs.map(dd => opts.sizeBy === 'argument_count' ? dd.argument_count : dd.page_count)
    const sizeExt = d3.extent(sizeVals) as [number, number]
    const sizeScale = opts.sizeBy === 'uniform' ? null : d3.scaleLinear().domain(sizeExt).range([4, 9])
    const getRadius = (d: DocNode) => {
      if (!sizeScale) return 6
      const val = opts.sizeBy === 'argument_count' ? d.argument_count : d.page_count
      return sizeScale(val)
    }

    const simNodes = docs.map(d => ({
      id: d.id, data: d,
      x: xScale(d.umap_x), y: yScale(d.umap_y),
      r: getRadius(d),
    }))
    const sim = d3.forceSimulation(simNodes)
      .force('collide', d3.forceCollide<typeof simNodes[0]>(n => n.r + 2).strength(0.3))
      .stop()
    for (let i = 0; i < 60; i++) sim.tick()
    simNodes.forEach(n => simPositions.current.set(n.id, { x: n.x, y: n.y }))

    // Zoom bound to SVG
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event) => {
        zoomG.attr('transform', event.transform)
        zoomG.classed('titles-visible', event.transform.k >= 2.0)
      })
    svg.call(zoom)

    // Concentric rings
    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 7; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2)
        .attr('r', i * 120)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(7,59,76,0.18)')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4 8')
    }

    // Background rect — lasso target (distinct from SVG zoom target)
    const bgRect = zoomG.append('rect')
      .attr('class', 'lasso-bg')
      .attr('x', -width * 4).attr('y', -height * 4)
      .attr('width', width * 8).attr('height', height * 8)
      .attr('fill', 'transparent')
      .attr('pointer-events', 'all')

    const dotLayer = zoomG.append('g').attr('class', 'dots')

    // Dots — stopPropagation prevents lasso trigger on dot click
    dotLayer.selectAll<SVGCircleElement, DocNode>('circle')
      .data(docs, d => d.id)
      .join('circle')
      .attr('class', 'corpus-dot')
      .attr('cx', d => simPositions.current.get(d.id)?.x ?? xScale(d.umap_x))
      .attr('cy', d => simPositions.current.get(d.id)?.y ?? yScale(d.umap_y))
      .attr('r', d => getRadius(d))
      .attr('fill', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : DOT_DEFAULT)
      .attr('stroke', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : 'none')
      .attr('stroke-width', 4)
      .attr('stroke-opacity', 0.4)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        optsRef.current.onClickToggle(d.id, event.shiftKey)
      })
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, svgEl)
        optsRef.current.setTooltip({ doc: d, x: mx, y: my })
      })
      .on('mouseleave', () => optsRef.current.setTooltip(null))

    // Title labels
    zoomG.append('g').attr('class', 'title-layer')
      .selectAll<SVGTextElement, DocNode>('text')
      .data(docs, d => d.id)
      .join('text')
      .attr('class', 'doc-title')
      .attr('x', d => simPositions.current.get(d.id)?.x ?? xScale(d.umap_x))
      .attr('y', d => (simPositions.current.get(d.id)?.y ?? yScale(d.umap_y)) + getRadius(d) + 10)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('fill', '#073b4c')
      .attr('font-size', '9px')
      .text(d => d.title.length > 20 ? d.title.slice(0, 20) + '…' : d.title)

    // Lasso bound to bgRect (not SVG) — avoids zoom conflict
    let lassoPath: [number, number][] = []
    let lassoEl: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null

    const lassoBehavior = d3.drag<SVGRectElement, unknown>()
      .on('start', (event) => {
        const [mx, my] = d3.pointer(event, zoomG.node()!)
        lassoPath = [[mx, my]]
        lassoEl = zoomG.append('path')
          .attr('class', 'lasso')
          .attr('fill', 'rgba(244,161,36,0.08)')
          .attr('stroke', '#F4A124')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '5 3')
      })
      .on('drag', (event) => {
        const [mx, my] = d3.pointer(event, zoomG.node()!)
        lassoPath.push([mx, my])
        lassoEl?.attr('d', 'M' + lassoPath.map(p => p.join(',')).join('L') + 'Z')
      })
      .on('end', () => {
        if (lassoPath.length > 3) {
          const inside: string[] = []
          dotLayer.selectAll<SVGCircleElement, DocNode>('circle').each(function(d) {
            const cx = +d3.select(this).attr('cx')
            const cy = +d3.select(this).attr('cy')
            if (isPointInPolygon([cx, cy], lassoPath)) inside.push(d.id)
          })
          if (inside.length > 0) optsRef.current.onLassoSelect(inside)
        }
        lassoEl?.remove()
        lassoEl = null
        lassoPath = []
      })

    bgRect.call(lassoBehavior)

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      if (!xScaleRef.current || !yScaleRef.current) return
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      xScaleRef.current.range([pad, w - pad])
      yScaleRef.current.range([h - pad, pad])
      const xS = xScaleRef.current
      const yS = yScaleRef.current
      d3.select(svgEl).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
        .attr('cx', d => xS(d.umap_x))
        .attr('cy', d => yS(d.umap_y))
      d3.select(svgEl).selectAll<SVGTextElement, DocNode>('.doc-title')
        .attr('x', d => xS(d.umap_x))
        .attr('y', d => yS(d.umap_y) + 14)
      d3.select(svgEl).selectAll('.rings circle').attr('cx', w / 2).attr('cy', h / 2)
      bgRect.attr('x', -w * 4).attr('y', -h * 4)
        .attr('width', w * 8).attr('height', h * 8)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    return () => { observer.disconnect() }
  }, [docs, opts.sizeBy])

  // Sync dot colors
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
      .attr('fill', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : DOT_DEFAULT)
      .attr('stroke', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : 'none')
  }, [opts.selectedIds])

  return {}
}
