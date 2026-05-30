# Floating Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 52 px side FilterRail in all three views with two draggable floating panels (filter ⚙ and legend ◈), each triggered by a round FAB button fixed at the bottom-left of the canvas.

**Architecture:** One new generic `FloatingPanel` component handles FAB + draggable panel. Each of the three views removes its `<FilterRail>` import, adds local `filterOpen`/`legendOpen` state, and passes view-specific JSX as children to two `<FloatingPanel>` instances. FilterRail files are kept but no longer rendered.

**Tech Stack:** React 18, TypeScript strict, CSS Modules, no drag library (mouse events only)

---

## File Map

**Created:**
- `src/components/FloatingPanel/FloatingPanel.tsx`
- `src/components/FloatingPanel/FloatingPanel.module.css`

**Modified:**
- `src/views/CorpusView/CorpusView.tsx`
- `src/views/GraphView/GraphView.tsx`
- `src/views/DetailView/DetailView.tsx`

**Unchanged (kept, just not rendered):**
- `src/components/FilterRail/FilterRail.tsx`
- `src/components/FilterRail/FilterRail.module.css`

---

### Task 1: FloatingPanel component

**Files:**
- Create: `src/components/FloatingPanel/FloatingPanel.tsx`
- Create: `src/components/FloatingPanel/FloatingPanel.module.css`

- [ ] **Step 1: Create `src/components/FloatingPanel/FloatingPanel.module.css`**

```css
/* FAB button — positioned absolute inside the view's canvas div */
.fab {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #073b4c;
  color: #fff;
  border: 2px solid transparent;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 8px rgba(7,59,76,0.35);
  user-select: none;
}
.fab:hover { box-shadow: 0 3px 12px rgba(7,59,76,0.5); }
.fab.open  { border-color: #F4A124; }

/* Floating panel — fixed in viewport, draggable */
.panel {
  position: fixed;
  width: 220px;
  z-index: 400;
  display: flex;
  flex-direction: column;
  max-height: 60vh;
  user-select: none;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  cursor: grab;
  border-bottom: 1px solid rgba(7,59,76,0.08);
  flex-shrink: 0;
}
.header:active { cursor: grabbing; }
.headerTitle {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #073b4c;
}
.close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #9ca3af;
  line-height: 1;
  padding: 0;
}
.close:hover { color: #374151; }
.body {
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
```

- [ ] **Step 2: Create `src/components/FloatingPanel/FloatingPanel.tsx`**

```tsx
import { useState, useEffect, useRef, type ReactNode } from 'react'
import styles from './FloatingPanel.module.css'

interface Props {
  icon: string
  label: string
  open: boolean
  onToggle: () => void
  /** bottom + left in px, absolute inside the canvas div */
  fabBottom: number
  fabLeft: number
  children: ReactNode
}

export function FloatingPanel({ icon, label, open, onToggle, fabBottom, fabLeft, children }: Props) {
  const fabRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ startMx: number; startMy: number; startPx: number; startPy: number } | null>(null)

  // Set initial panel position once, relative to FAB, on first open
  const initialized = useRef(false)
  useEffect(() => {
    if (!open || initialized.current || !fabRef.current) return
    initialized.current = true
    const rect = fabRef.current.getBoundingClientRect()
    setPos({ x: rect.right + 10, y: Math.max(8, rect.top - 120) })
  }, [open])

  // Drag handlers on document so the panel doesn't lose drag if cursor exits it
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return
      const dx = e.clientX - drag.current.startMx
      const dy = e.clientY - drag.current.startMy
      setPos({ x: drag.current.startPx + dx, y: drag.current.startPy + dy })
    }
    const onUp = () => { drag.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (!pos) return
    e.preventDefault()
    drag.current = { startMx: e.clientX, startMy: e.clientY, startPx: pos.x, startPy: pos.y }
  }

  return (
    <>
      <button
        ref={fabRef}
        className={`${styles.fab} ${open ? styles.open : ''}`}
        style={{ bottom: fabBottom, left: fabLeft }}
        onClick={onToggle}
        aria-label={label}
        title={label}
      >
        {icon}
      </button>

      {open && pos && (
        <div
          className={`card ${styles.panel}`}
          style={{ left: pos.x, top: pos.y }}
        >
          <div className={styles.header} onMouseDown={onHeaderMouseDown}>
            <span className={styles.headerTitle}>{label}</span>
            <button className={styles.close} onClick={onToggle} aria-label="Close">×</button>
          </div>
          <div className={styles.body}>
            {children}
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npm run test:run
```

Expected: 14 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/components/FloatingPanel/ && git commit -m "feat: FloatingPanel component — draggable FAB-triggered panel"
```

---

### Task 2: CorpusView — replace FilterRail with floating panels

**Files:**
- Modify: `src/views/CorpusView/CorpusView.tsx`

**Legend content for Corpus:**
- Dot colours: selected (red `#ef476f`) and unselected (blue `#74b9d6`)
- Size key: large circle = high count, small = low count

- [ ] **Step 1: Replace `src/views/CorpusView/CorpusView.tsx`**

```tsx
import { useRef, useState, useEffect, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FloatingPanel } from '../../components/FloatingPanel/FloatingPanel'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { useCorpusD3 } from './useCorpusD3'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

export function CorpusView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [docs, setDocs] = useState<DocNode[]>([])
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection,
    clearSelection, selectAll, setSizeBy, sizeBy,
  } = useStore()

  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  useCorpusD3(svgRef, docs, {
    selectedIds,
    sizeBy,
    onLassoSelect: (ids) =>
      setSelectedDocuments([...new Set([...selectedDocumentIds, ...ids])]),
    onClickToggle: (id, shiftKey) => {
      if (shiftKey) toggleDocumentSelection(id)
      else setSelectedDocuments(selectedDocumentIds.includes(id) ? [] : [id])
    },
    setTooltip,
  })

  return (
    <div className={styles.view}>
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />
        <div className={styles.lassoChip}>LASSO</div>

        {tooltip && (
          <FloatingCard style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
              {tooltip.doc.title}
            </div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>
              {tooltip.doc.page_count} pages · {tooltip.doc.argument_count} arguments
            </div>
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
              {tooltip.doc.top_terms.join(' · ')}
            </div>
          </FloatingCard>
        )}

        {/* Filter FAB */}
        <FloatingPanel
          icon="⚙" label="Filters"
          open={filterOpen} onToggle={() => setFilterOpen(v => !v)}
          fabBottom={20} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Selection</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#073b4c' }}>
                {selectedDocumentIds.length} selected
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={clearSelection} style={btnStyle}>Clear</button>
              <button onClick={() => selectAll(docs.map(d => d.id))} style={btnStyle}>All</button>
            </div>
          </div>

          <div>
            <div style={sectionLabel}>Size by</div>
            {([['argument_count', 'Argument count'], ['uniform', 'Uniform'], ['page_count', 'Page count']] as const).map(([val, lbl]) => (
              <label key={val} style={radioRow}>
                <input type="radio" name="corpus-size" checked={sizeBy === val} onChange={() => setSizeBy(val)}
                  style={{ accentColor: '#F4A124' }} />
                <span style={{ fontSize: 11, color: '#374151' }}>{lbl}</span>
              </label>
            ))}
          </div>
        </FloatingPanel>

        {/* Legend FAB */}
        <FloatingPanel
          icon="◈" label="Legend"
          open={legendOpen} onToggle={() => setLegendOpen(v => !v)}
          fabBottom={68} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Document dots</div>
            {([['#74b9d6', 'Unselected'], ['#ef476f', 'Selected']] as const).map(([color, lbl]) => (
              <div key={lbl} style={legendRow}>
                <span style={{ ...dot, background: color }} />
                <span style={legendText}>{lbl}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={sectionLabel}>Size</div>
            {([['10px', 'High argument / page count'], ['5px', 'Low argument / page count']] as const).map(([size, lbl]) => (
              <div key={lbl} style={legendRow}>
                <span style={{ ...dot, width: size, height: size, background: '#74b9d6', flexShrink: 0 }} />
                <span style={legendText}>{lbl}</span>
              </div>
            ))}
          </div>
        </FloatingPanel>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: '#073b4c', opacity: 0.5, marginBottom: 8,
}
const btnStyle: React.CSSProperties = {
  flex: 1, background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
const radioRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer',
}
const legendRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
}
const dot: React.CSSProperties = {
  width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
}
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }
```

- [ ] **Step 2: Remove the stale `canvasWrapper` class from CorpusView.module.css if present, and ensure `.view` has no flex children it doesn't own**

Read `src/views/CorpusView/CorpusView.module.css`. The `.view` rule should just be:
```css
.view   { display: flex; height: 100%; overflow: hidden; }
.canvas { flex: 1; position: relative; background: #fafbfc; cursor: crosshair; }
.svg    { width: 100%; height: 100%; display: block; }
.lassoChip {
  position: absolute; top: 12px; left: 12px;
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  color: #073b4c; opacity: 0.4;
  background: rgba(255,255,255,0.8); border-radius: 4px; padding: 3px 7px;
  pointer-events: none;
}
```
If it already matches, no change needed.

- [ ] **Step 3: TypeScript check + tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit && npm run test:run
```

Expected: no TS errors, 14 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/CorpusView/ && git commit -m "feat: corpus view — floating filter + legend panels, remove FilterRail"
```

---

### Task 3: GraphView — replace FilterRail with floating panels

**Files:**
- Modify: `src/views/GraphView/GraphView.tsx`
- Modify: `src/views/GraphView/GraphView.module.css`

**Legend content for Graph:**
- Node types: dark square = Argument, blue circle = Entity, teal diamond = Concept
- Edge groups: green = positive, red = negative, yellow = causal, gray = structural

**Filter content for Graph:**
- Node types (Argument / Entity / Concept checkboxes)
- Confidence slider
- Relation groups (positive / negative / causal / structural — with colour swatches)
- Layout buttons (Heat / Freeze)

- [ ] **Step 1: Replace `src/views/GraphView/GraphView.tsx`**

```tsx
import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FloatingPanel } from '../../components/FloatingPanel/FloatingPanel'
import { useGraphD3 } from './useGraphD3'
import type { HoverItem } from './useGraphD3'
import { NodeFloatingCard } from './NodeFloatingCard'
import { RELATION_COLORS } from '../../utils/geometry'
import type { GraphNode, GraphEdge } from '../../types'
import styles from './GraphView.module.css'

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [, setHoverItem] = useState<HoverItem>(null)
  const [stickyItem, setStickyItem] = useState<HoverItem>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const { selectedDocumentIds, selectedNodeId, setSelectedNode, setActiveView, filters, setFilters } = useStore()

  useEffect(() => {
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges }) => {
      setNodes(nodes); setEdges(edges)
    })
  }, [selectedDocumentIds])

  const { reheat, freeze } = useGraphD3(svgRef, nodes, edges, {
    filters,
    selectedNodeId,
    onNodeClick: (node) => {
      setSelectedNode(node.id)
      setStickyItem({ type: 'node', node, x: 0, y: 0 })
    },
    onHover: (item) => setHoverItem(item),
    onCanvasClick: () => {
      setSelectedNode(null)
      setStickyItem(null)
    },
  })

  const displayItem = stickyItem

  return (
    <div className={styles.view}>
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />

        {displayItem && (
          <NodeFloatingCard
            item={displayItem}
            sticky={!!stickyItem}
            onDismiss={() => { setStickyItem(null); setSelectedNode(null) }}
            onOpenDetail={() => setActiveView('detail')}
          />
        )}

        {/* Filter FAB */}
        <FloatingPanel
          icon="⚙" label="Filters"
          open={filterOpen} onToggle={() => setFilterOpen(v => !v)}
          fabBottom={20} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Node types</div>
            {(['Argument', 'Entity', 'Concept'] as const).map(type => (
              <label key={type} style={checkRow}>
                <input type="checkbox"
                  checked={filters.nodeTypes[type]}
                  onChange={e => setFilters({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
                  style={{ accentColor: '#F4A124' }} />
                <span style={{ fontSize: 11, color: '#374151' }}>{type}</span>
              </label>
            ))}
          </div>

          <div>
            <div style={sectionLabel}>Min confidence</div>
            <input type="range" min={0} max={1} step={0.05}
              value={filters.minConfidence}
              onChange={e => setFilters({ minConfidence: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#F4A124', marginBottom: 4 }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: '#F4A124' }}>
              ≥ {filters.minConfidence.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={sectionLabel}>Relations</div>
            {(['positive', 'negative', 'causal', 'structural'] as const).map(group => (
              <label key={group} style={checkRow}>
                <input type="checkbox"
                  checked={filters.relationGroups[group]}
                  onChange={e => setFilters({ relationGroups: { ...filters.relationGroups, [group]: e.target.checked } })}
                  style={{ accentColor: '#F4A124' }} />
                <span style={{ width: 10, height: 10, borderRadius: 2, background: group === 'structural' ? '#64748b' : RELATION_COLORS[group], flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: '#374151', textTransform: 'capitalize' }}>{group}</span>
              </label>
            ))}
          </div>

          <div>
            <div style={sectionLabel}>Layout</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={reheat} style={btnStyle}>Reheat</button>
              <button onClick={freeze} style={{ ...btnStyle, background: '#e2e8f0', color: '#073b4c' }}>Freeze</button>
            </div>
          </div>
        </FloatingPanel>

        {/* Legend FAB */}
        <FloatingPanel
          icon="◈" label="Legend"
          open={legendOpen} onToggle={() => setLegendOpen(v => !v)}
          fabBottom={68} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Nodes</div>
            <div style={legendRow}>
              <span style={{ width: 14, height: 14, background: '#073b4c', borderRadius: 3, flexShrink: 0 }} />
              <span style={legendText}>Argument</span>
            </div>
            <div style={legendRow}>
              <span style={{ width: 14, height: 14, background: '#118ab2', borderRadius: '50%', flexShrink: 0 }} />
              <span style={legendText}>Entity</span>
            </div>
            <div style={legendRow}>
              <span style={{
                width: 0, height: 0,
                borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
                borderBottom: '14px solid #74b9d6',
                flexShrink: 0,
              }} />
              <span style={legendText}>Concept</span>
            </div>
          </div>

          <div>
            <div style={sectionLabel}>Edges</div>
            {([
              ['positive',   'Positive',   RELATION_COLORS.positive],
              ['negative',   'Negative',   RELATION_COLORS.negative],
              ['causal',     'Causal',     RELATION_COLORS.causal],
              ['structural', 'Structural', '#64748b'],
            ] as const).map(([, lbl, color]) => (
              <div key={lbl} style={legendRow}>
                <span style={{ width: 20, height: 3, background: color, borderRadius: 2, flexShrink: 0 }} />
                <span style={legendText}>{lbl}</span>
              </div>
            ))}
          </div>
        </FloatingPanel>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: '#073b4c', opacity: 0.5, marginBottom: 8,
}
const checkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer',
}
const btnStyle: React.CSSProperties = {
  flex: 1, background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
const legendRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
}
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }
```

- [ ] **Step 2: Update `src/views/GraphView/GraphView.module.css`**

The `.canvasWrapper` class is no longer needed. Replace the file with:

```css
.view   { display: flex; height: 100%; overflow: hidden; }
.canvas { flex: 1; position: relative; background: #fafbfc; overflow: hidden; }
.svg    { width: 100%; height: 100%; display: block; }
```

- [ ] **Step 3: TypeScript check + tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit && npm run test:run
```

Expected: no TS errors, 14 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/GraphView/ && git commit -m "feat: graph view — floating filter + legend panels, remove FilterRail"
```

---

### Task 4: DetailView — replace FilterRail with floating panels

**Files:**
- Modify: `src/views/DetailView/DetailView.tsx`

**Legend content for Detail:**
- Relation groups: positive (green), negative (red), causal (yellow)

**Filter content for Detail:**
- Relation group checkboxes (positive / negative / causal) with colour swatches

- [ ] **Step 1: Replace `src/views/DetailView/DetailView.tsx`**

```tsx
import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FloatingPanel } from '../../components/FloatingPanel/FloatingPanel'
import { DetailMiniMap } from './DetailMiniMap'
import { RelationList } from './RelationList'
import { RELATION_COLORS } from '../../utils/geometry'
import type { ArgumentDetail, DocNode, RelationGroup, ArgumentRelation } from '../../types'
import styles from './DetailView.module.css'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  positive: true, negative: true, causal: true, structural: false,
}

export function DetailView() {
  const { selectedNodeId, setSelectedNode } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)
  const [navStack, setNavStack] = useState<string[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    if (!selectedNodeId) return
    dataService.getArgumentDetail(selectedNodeId).then(setDetail)
  }, [selectedNodeId])

  const toggleGroup = (group: RelationGroup) =>
    setVisibleGroups(g => ({ ...g, [group]: !g[group] }))

  const navigateToArgument = (rel: ArgumentRelation) => {
    if (!detail || !rel.target_argument_id || rel.target_argument_id === detail.argument.id) return
    setNavStack(prev => [...prev, detail.argument.id])
    setSelectedNode(rel.target_argument_id)
  }

  const navigateBack = () => {
    if (navStack.length === 0) return
    const prevId = navStack[navStack.length - 1]
    setNavStack(s => s.slice(0, -1))
    setSelectedNode(prevId)
  }

  if (!detail) {
    return (
      <div className={styles.empty}>
        Select a node in the Graph view to open its detail.
      </div>
    )
  }

  return (
    <div className={styles.view}>
      <div className={styles.content}>
        {navStack.length > 0 && (
          <button onClick={navigateBack} className={styles.breadcrumb}>
            ← {navStack.length > 1 ? `${navStack.length} levels back` : 'Back'}
          </button>
        )}
        <div className={styles.header}>
          <div className="sl">Argument</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#073b4c', marginBottom: 6 }}>
            {detail.argument.source_document_title}
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
            "{detail.argument.full_text}"
          </div>
        </div>
        <div className={styles.mapWrapper}>
          <DetailMiniMap detail={detail} allDocs={allDocs} />
        </div>
        <div className={styles.listWrapper}>
          <div className="sl" style={{ padding: '0 0 6px' }}>
            {detail.relations.length} relations across corpus
          </div>
          <RelationList
            detail={detail}
            visibleGroups={visibleGroups}
            onRowClick={navigateToArgument}
            focalId={detail.argument.id}
          />
        </div>

        {/* Filter FAB — inside .content which has position: relative via the view layout */}
        <FloatingPanel
          icon="⚙" label="Filters"
          open={filterOpen} onToggle={() => setFilterOpen(v => !v)}
          fabBottom={20} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Relation groups</div>
            {(['positive', 'negative', 'causal'] as const).map(group => (
              <label key={group} style={checkRow}>
                <input type="checkbox"
                  checked={visibleGroups[group]}
                  onChange={() => toggleGroup(group)}
                  style={{ accentColor: '#F4A124' }} />
                <span style={{ width: 10, height: 10, borderRadius: 2, background: RELATION_COLORS[group], flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: '#374151', textTransform: 'capitalize' }}>{group}</span>
              </label>
            ))}
          </div>
        </FloatingPanel>

        {/* Legend FAB */}
        <FloatingPanel
          icon="◈" label="Legend"
          open={legendOpen} onToggle={() => setLegendOpen(v => !v)}
          fabBottom={68} fabLeft={20}
        >
          <div>
            <div style={sectionLabel}>Relation groups</div>
            {([
              ['positive', 'Positive', RELATION_COLORS.positive],
              ['negative', 'Negative', RELATION_COLORS.negative],
              ['causal',   'Causal',   RELATION_COLORS.causal],
            ] as const).map(([, lbl, color]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#374151' }}>{lbl}</span>
              </div>
            ))}
          </div>
        </FloatingPanel>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
  color: '#073b4c', opacity: 0.5, marginBottom: 8,
}
const checkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer',
}
```

- [ ] **Step 2: Add `position: relative` to `.content` in `src/views/DetailView/DetailView.module.css`**

The FABs use `position: absolute` and need a positioned ancestor. Read the file and update `.content`:

```css
.view    { display: flex; height: 100%; overflow: hidden; }
.empty   { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: #9ca3af; }
.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 16px; gap: 12px; position: relative; }
.header  {
  flex-shrink: 0;
  border-left: 3px solid #F4A124;
  padding-left: 12px;
}
.breadcrumb {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 11px; font-weight: 600; color: #118ab2;
  text-align: left; flex-shrink: 0;
}
.breadcrumb:hover { text-decoration: underline; }
.mapWrapper { flex-shrink: 0; border-radius: 12px; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(17,138,178,0.18), 0 2px 6px rgba(7,59,76,0.06); }
.listWrapper { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
```

- [ ] **Step 3: TypeScript check + tests**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && npx tsc --noEmit && npm run test:run
```

Expected: no TS errors, 14 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/alvarodelser/Projects/GraphVisor && git add src/views/DetailView/ && git commit -m "feat: detail view — floating filter + legend panels, remove FilterRail"
```
