import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { DocNode, Projection, SizeBy } from '../../types'
import { isPointInPolygon } from '../../utils/geometry'

interface Options {
  selectedIds: Set<string>
  projection: Projection
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
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>()
  const simPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const optsRef = useRef(opts)
  optsRef.current = opts

  // Refs so ResizeObserver can access current scales
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
    const getX = (d: DocNode) => optsRef.current.projection === 'umap' ? d.umap_x : d.pca_x
    const getY = (d: DocNode) => optsRef.current.projection === 'umap' ? d.umap_y : d.pca_y

    const xScale = d3.scaleLinear()
      .domain(d3.extent(docs, getX) as [number, number]).range([pad, width - pad])
    const yScale = d3.scaleLinear()
      .domain(d3.extent(docs, getY) as [number, number]).range([height - pad, pad])
    xScaleRef.current = xScale
    yScaleRef.current = yScale

    const sizeVals = docs.map(dd => optsRef.current.sizeBy === 'argument_count' ? dd.argument_count : dd.page_count)
    const sizeExt = d3.extent(sizeVals) as [number, number]
    const sizeScale = optsRef.current.sizeBy === 'uniform' ? null : d3.scaleLinear().domain(sizeExt).range([4, 9])
    const getRadius = (d: DocNode) => {
      if (!sizeScale) return 6
      const val = optsRef.current.sizeBy === 'argument_count' ? d.argument_count : d.page_count
      return sizeScale(val)
    }

    const simNodes = docs.map(d => ({
      id: d.id, data: d,
      x: xScale(getX(d)), y: yScale(getY(d)),
      r: getRadius(d),
    }))
    const sim = d3.forceSimulation(simNodes)
      .force('collide', d3.forceCollide<typeof simNodes[0]>(n => n.r + 2).strength(0.3))
      .stop()
    for (let i = 0; i < 60; i++) sim.tick()
    simNodes.forEach(n => simPositions.current.set(n.id, { x: n.x, y: n.y }))

    // Zoom
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event) => {
        zoomG.attr('transform', event.transform)
        // Toggle title visibility based on scale
        const scale = event.transform.k
        zoomG.classed('titles-visible', scale >= 2.0)
      })
    svg.call(zoom)
    zoomRef.current = zoom

    // Concentric rings (inside zoom group)
    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 7; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2)
        .attr('r', i * 120)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(7,59,76,0.05)')
        .attr('stroke-width', 1)
    }

    const dotLayer = zoomG.append('g').attr('class', 'dots')

    // Dots
    dotLayer.selectAll<SVGCircleElement, DocNode>('circle')
      .data(docs, d => d.id)
      .join('circle')
      .attr('class', 'corpus-dot')
      .attr('cx', d => simPositions.current.get(d.id)?.x ?? xScale(getX(d)))
      .attr('cy', d => simPositions.current.get(d.id)?.y ?? yScale(getY(d)))
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

    // Title labels (opacity controlled by CSS .titles-visible class)
    zoomG.append('g').attr('class', 'title-layer')
      .selectAll<SVGTextElement, DocNode>('text')
      .data(docs, d => d.id)
      .join('text')
      .attr('class', 'doc-title')
      .attr('x', d => simPositions.current.get(d.id)?.x ?? xScale(getX(d)))
      .attr('y', d => (simPositions.current.get(d.id)?.y ?? yScale(getY(d))) + getRadius(d) + 10)
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none')
      .attr('fill', '#073b4c')
      .attr('font-size', '9px')
      .text(d => d.title.length > 20 ? d.title.slice(0, 20) + '…' : d.title)

    // Lasso
    let lassoPath: [number, number][] = []
    let lassoEl: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null

    const lassoBehavior = d3.drag<SVGSVGElement, unknown>()
      .filter(event => !event.button && !event.ctrlKey)
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

    svg.call(lassoBehavior)

    // ResizeObserver
    const observer = new ResizeObserver(() => {
      if (!xScaleRef.current || !yScaleRef.current) return
      const { width: w, height: h } = svgEl.getBoundingClientRect()
      if (w < 10 || h < 10) return
      xScaleRef.current.range([pad, w - pad])
      yScaleRef.current.range([h - pad, pad])
      const xS = xScaleRef.current
      const yS = yScaleRef.current
      const proj = optsRef.current.projection
      d3.select(svgEl).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
        .attr('cx', d => xS(proj === 'umap' ? d.umap_x : d.pca_x))
        .attr('cy', d => yS(proj === 'umap' ? d.umap_y : d.pca_y))
      d3.select(svgEl).selectAll<SVGTextElement, DocNode>('.doc-title')
        .attr('x', d => xS(proj === 'umap' ? d.umap_x : d.pca_x))
        .attr('y', d => yS(proj === 'umap' ? d.umap_y : d.pca_y) + 14)
      d3.select(svgEl).selectAll('.rings circle')
        .attr('cx', w / 2).attr('cy', h / 2)
    })
    observer.observe(svgEl.parentElement ?? svgEl)

    return () => { observer.disconnect() }
  }, [docs, opts.projection, opts.sizeBy])

  // Sync dot colors when selection changes
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
      .attr('fill', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : DOT_DEFAULT)
      .attr('stroke', d => optsRef.current.selectedIds.has(d.id) ? DOT_SELECTED : 'none')
  }, [opts.selectedIds])

  const zoomToFit = () => {
    if (!svgRef.current || !zoomRef.current) return
    const svg = d3.select(svgRef.current)
    const { width, height } = svgRef.current.getBoundingClientRect()
    svg.transition().duration(500).call(
      zoomRef.current.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.9).translate(-width / 2, -height / 2)
    )
  }

  const resetZoom = () => {
    if (!svgRef.current || !zoomRef.current) return
    d3.select(svgRef.current)
      .transition().duration(400)
      .call(zoomRef.current.transform, d3.zoomIdentity)
  }

  return { zoomToFit, resetZoom }
}
