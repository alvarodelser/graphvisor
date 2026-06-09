# Discover Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth "Discover" top-nav view to GraphVisor that presents corpus-level AI-generated hypotheses in a filterable, sortable card grid with radar charts.

**Architecture:** Extend the existing 3-panel sliding Shell to 4 panels by adding `'discover'` to `ActiveView` and widening the `Shell` children tuple. A new `DiscoverView` component owns its own filter/sort local state and renders `HypothesisCard` components loaded once from `hypothesis_L2.json` via `DataService.getHypotheses()`.

**Tech Stack:** React 18, TypeScript, Vitest + @testing-library/react, CSS Modules, inline SVG for radar charts (no D3).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/types/index.ts` | Add `Hypothesis` interface, extend `ActiveView` |
| Modify | `src/data/DataService.ts` | Add `getHypotheses()` to interface + implementation |
| Modify | `src/components/Shell/Shell.tsx` | 4th tab, widen children type |
| Create | `src/views/DiscoverView/HypothesisCard.tsx` | Single card: badge, avg score, text, radar SVG, score pills |
| Create | `src/views/DiscoverView/DiscoverView.tsx` | Filter/sort bar + card grid |
| Create | `src/views/DiscoverView/DiscoverView.module.css` | Layout styles |
| Modify | `src/App.tsx` | Add `<DiscoverView />` as 4th child |
| Modify | `tests/DataService.test.ts` | Add `getHypotheses` test |
| Create | `tests/HypothesisCard.test.tsx` | Card rendering tests |
| Create | `tests/DiscoverView.test.tsx` | Filter/sort interaction tests |

---

## Task 1: Add `Hypothesis` type and extend `ActiveView`

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `Hypothesis` interface and extend `ActiveView`**

In `src/types/index.ts`, make two changes:

Change line 16 from:
```ts
export type ActiveView = 'corpus' | 'graph' | 'detail'
```
To:
```ts
export type ActiveView = 'corpus' | 'graph' | 'detail' | 'discover'
```

Then add the following interface before the `FilterState` interface at the bottom:
```ts
export interface Hypothesis {
  hypothesis: string
  decision: 'ADVANCE' | 'BORDERLINE'
  scores: {
    novelty: number
    scientific_plausibility: number
    potential_impact: number
    commercial_potential: number
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: no errors. (The store's `setActiveView` already accepts `ActiveView` so adding `'discover'` just widens the union — no callers break.)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add Hypothesis type and extend ActiveView to include discover"
```

---

## Task 2: Add `getHypotheses()` to DataService

**Files:**
- Modify: `src/data/DataService.ts`
- Modify: `tests/DataService.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/DataService.test.ts`:
```ts
describe('RealDataService.getHypotheses', () => {
  it('returns 8 hypotheses with required fields', async () => {
    const hypotheses = await svc.getHypotheses()
    expect(hypotheses).toHaveLength(8)
    expect(hypotheses[0]).toHaveProperty('hypothesis')
    expect(hypotheses[0]).toHaveProperty('decision')
    expect(hypotheses[0].decision).toMatch(/^(ADVANCE|BORDERLINE)$/)
    expect(hypotheses[0].scores).toHaveProperty('novelty')
    expect(hypotheses[0].scores).toHaveProperty('scientific_plausibility')
    expect(hypotheses[0].scores).toHaveProperty('potential_impact')
    expect(hypotheses[0].scores).toHaveProperty('commercial_potential')
  })

  it('all scores are numbers between 1 and 10', async () => {
    const hypotheses = await svc.getHypotheses()
    for (const h of hypotheses) {
      for (const v of Object.values(h.scores)) {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(10)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:run -- tests/DataService.test.ts
```
Expected: FAIL — `svc.getHypotheses is not a function`

- [ ] **Step 3: Add `getHypotheses` to the interface and implementation**

In `src/data/DataService.ts`:

**3a.** Add the import at the top (after existing imports):
```ts
import type { Hypothesis } from '../types'
import hypothesisJson from './hypothesis_L2.json'
```

**3b.** Add to the `DataServiceInterface`:
```ts
export interface DataServiceInterface {
  getDocuments(): Promise<DocNode[]>
  getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; blobs: ArgumentBlob[] }>
  getArgumentDetail(nodeId: string): Promise<ArgumentDetail>
  getHypotheses(): Promise<Hypothesis[]>
}
```

**3c.** Add the method to `RealDataService` (before the closing `}` of the class):
```ts
  getHypotheses(): Promise<Hypothesis[]> {
    return Promise.resolve(hypothesisJson as Hypothesis[])
  }
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test:run -- tests/DataService.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/DataService.ts tests/DataService.test.ts
git commit -m "feat: add getHypotheses() to DataService"
```

---

## Task 3: Extend Shell to 4 views

**Files:**
- Modify: `src/components/Shell/Shell.tsx`

- [ ] **Step 1: Update `VIEW_ORDER`, `children` type, and add the Discover tab**

Replace the entire contents of `src/components/Shell/Shell.tsx` with:
```tsx
import type { ReactNode } from 'react'
import { useStore } from '../../store/useStore'
import { StatusBar } from '../StatusBar/StatusBar'
import styles from './Shell.module.css'

const VIEW_ORDER = ['corpus', 'graph', 'detail', 'discover'] as const

interface Props {
  children: [ReactNode, ReactNode, ReactNode, ReactNode]
}

export function Shell({ children }: Props) {
  const { activeView, setActiveView, selectedDocumentIds, selectedNodeId } = useStore()
  const viewIndex = VIEW_ORDER.indexOf(activeView)

  const showCTA =
    (activeView === 'corpus' && selectedDocumentIds.length > 0) ||
    (activeView === 'graph' && selectedNodeId !== null)
  const ctaLabel = activeView === 'corpus' ? 'View Graph →' : 'Open Detail →'
  const handleCTA = () => setActiveView(activeView === 'corpus' ? 'graph' : 'detail')

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <span className={styles.logo}>GRAPHVISOR</span>
        <nav className={styles.tabs}>
          {(['corpus', 'graph', 'detail', 'discover'] as const).map((v) => (
            <button
              key={v}
              className={[
                styles.tab,
                activeView === v ? styles.active : '',
                v === 'detail' && !selectedNodeId ? styles.dimmed : '',
              ].join(' ')}
              onClick={() => (v !== 'detail' || selectedNodeId) && setActiveView(v)}
              disabled={v === 'detail' && !selectedNodeId}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
              {v === 'graph' && selectedDocumentIds.length > 0 && (
                <span className={styles.badge}>{selectedDocumentIds.length}</span>
              )}
              {v === 'detail' && selectedNodeId && (
                <span className={styles.dot}>●</span>
              )}
            </button>
          ))}
        </nav>
        {showCTA && (
          <button className={styles.cta} onClick={handleCTA}>{ctaLabel}</button>
        )}
      </header>

      <div className={styles.viewArea}>
        <div
          className={styles.viewTrack}
          style={{ transform: `translateX(calc(-${viewIndex} * 100%))` }}
        >
          {children.map((child, i) => (
            <div key={i} className={styles.viewPanel}>{child}</div>
          ))}
        </div>
      </div>

      <StatusBar />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors (App.tsx will error until Task 6 adds the 4th child — that's fine at this stage since we haven't wired it yet, but the Shell itself is valid).

- [ ] **Step 3: Commit**

```bash
git add src/components/Shell/Shell.tsx
git commit -m "feat: extend Shell to 4 views with Discover tab"
```

---

## Task 4: Create `HypothesisCard` component

**Files:**
- Create: `src/views/DiscoverView/HypothesisCard.tsx`
- Create: `tests/HypothesisCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/HypothesisCard.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HypothesisCard } from '../src/views/DiscoverView/HypothesisCard'
import type { Hypothesis } from '../src/types'

const advanceHyp: Hypothesis = {
  hypothesis: 'Test hypothesis text for ADVANCE decision.',
  decision: 'ADVANCE',
  scores: { novelty: 9, scientific_plausibility: 8, potential_impact: 9, commercial_potential: 8 },
}

const borderlineHyp: Hypothesis = {
  hypothesis: 'Test hypothesis text for BORDERLINE decision.',
  decision: 'BORDERLINE',
  scores: { novelty: 7, scientific_plausibility: 7, potential_impact: 8, commercial_potential: 6 },
}

describe('HypothesisCard', () => {
  it('renders ADVANCE badge', () => {
    render(<HypothesisCard hypothesis={advanceHyp} />)
    expect(screen.getByText('ADVANCE')).toBeInTheDocument()
  })

  it('renders BORDERLINE badge', () => {
    render(<HypothesisCard hypothesis={borderlineHyp} />)
    expect(screen.getByText('BORDERLINE')).toBeInTheDocument()
  })

  it('renders average score for ADVANCE (8.5)', () => {
    render(<HypothesisCard hypothesis={advanceHyp} />)
    expect(screen.getByText(/8\.5/)).toBeInTheDocument()
  })

  it('renders average score for BORDERLINE (7.0)', () => {
    render(<HypothesisCard hypothesis={borderlineHyp} />)
    // (7+7+8+6)/4 = 7.0
    expect(screen.getByText(/7\.0/)).toBeInTheDocument()
  })

  it('renders score pills N, P, I, C', () => {
    render(<HypothesisCard hypothesis={advanceHyp} />)
    expect(screen.getByText('N 9')).toBeInTheDocument()
    expect(screen.getByText('P 8')).toBeInTheDocument()
    expect(screen.getByText('I 9')).toBeInTheDocument()
    expect(screen.getByText('C 8')).toBeInTheDocument()
  })

  it('renders hypothesis text', () => {
    render(<HypothesisCard hypothesis={advanceHyp} />)
    expect(screen.getByText('Test hypothesis text for ADVANCE decision.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- tests/HypothesisCard.test.tsx
```
Expected: FAIL — `Cannot find module '../src/views/DiscoverView/HypothesisCard'`

- [ ] **Step 3: Create the `HypothesisCard` component**

Create `src/views/DiscoverView/HypothesisCard.tsx`:
```tsx
import type { Hypothesis } from '../../types'

interface Props {
  hypothesis: Hypothesis
}

const MAX_R = 32
const AXES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]

function toPoints(fractions: number[]): string {
  return fractions
    .map((f, i) => {
      const r = f * MAX_R
      return `${(Math.cos(AXES[i]) * r).toFixed(2)},${(Math.sin(AXES[i]) * r).toFixed(2)}`
    })
    .join(' ')
}

const GRID_RINGS = [0.25, 0.5, 0.75, 1.0].map(f => toPoints([f, f, f, f]))

export function HypothesisCard({ hypothesis }: Props) {
  const { decision, scores } = hypothesis
  const avg = (scores.novelty + scores.scientific_plausibility + scores.potential_impact + scores.commercial_potential) / 4
  const isAdvance = decision === 'ADVANCE'
  const accentColor = isAdvance ? '#06d6a0' : '#F4A124'
  const fillColor = isAdvance ? 'rgba(6,214,160,0.15)' : 'rgba(244,161,36,0.15)'

  const scorePoints = toPoints([
    scores.novelty / 10,
    scores.scientific_plausibility / 10,
    scores.potential_impact / 10,
    scores.commercial_potential / 10,
  ])

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      border: '1px solid rgba(7,59,76,0.08)',
      boxShadow: '0 1px 4px rgba(7,59,76,0.06)',
      padding: 14,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header: badge + avg score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: accentColor,
          background: isAdvance ? 'rgba(6,214,160,0.1)' : 'rgba(244,161,36,0.1)',
          padding: '3px 8px',
          borderRadius: 8,
        }}>
          {decision}
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#073b4c' }}>
          {avg.toFixed(1)}<span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 400 }}>/10</span>
        </span>
      </div>

      {/* Hypothesis text — clamped to 3 lines */}
      <p style={{
        fontSize: 10,
        color: '#374151',
        lineHeight: 1.55,
        margin: 0,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }} title={hypothesis.hypothesis}>
        {hypothesis.hypothesis}
      </p>

      {/* Radar chart */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={80} height={80} viewBox={`${-MAX_R - 10} ${-MAX_R - 10} ${(MAX_R + 10) * 2} ${(MAX_R + 10) * 2}`}>
          {GRID_RINGS.map((pts, i) => (
            <polygon key={i} points={pts} fill="none" stroke="rgba(7,59,76,0.08)" strokeWidth={0.7} />
          ))}
          <polygon points={scorePoints} fill={fillColor} stroke={accentColor} strokeWidth={1.5} />
          {(['N', 'P', 'I', 'C'] as const).map((label, i) => {
            const r = MAX_R + 7
            const x = Math.cos(AXES[i]) * r
            const y = Math.sin(AXES[i]) * r
            return (
              <text
                key={label}
                x={x.toFixed(2)}
                y={(y + 2).toFixed(2)}
                fontSize={7}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#9ca3af"
                fontFamily="system-ui, sans-serif"
              >
                {label}
              </text>
            )
          })}
        </svg>
      </div>

      {/* Score pills */}
      <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
        {[
          ['N', scores.novelty],
          ['P', scores.scientific_plausibility],
          ['I', scores.potential_impact],
          ['C', scores.commercial_potential],
        ].map(([label, val]) => (
          <span key={label as string} style={{
            fontSize: 8,
            fontWeight: 700,
            background: 'rgba(7,59,76,0.06)',
            color: '#073b4c',
            padding: '2px 6px',
            borderRadius: 6,
          }}>
            {label} {val}
          </span>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:run -- tests/HypothesisCard.test.tsx
```
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/DiscoverView/HypothesisCard.tsx tests/HypothesisCard.test.tsx
git commit -m "feat: add HypothesisCard component with radar chart"
```

---

## Task 5: Create `DiscoverView` component and CSS

**Files:**
- Create: `src/views/DiscoverView/DiscoverView.tsx`
- Create: `src/views/DiscoverView/DiscoverView.module.css`
- Create: `tests/DiscoverView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/DiscoverView.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DiscoverView } from '../src/views/DiscoverView/DiscoverView'

// vi.mock is hoisted before imports by vitest. Data is inlined in the factory
// so it doesn't reference module-scope variables (which would be undefined when hoisted).
vi.mock('../src/data/DataService', () => ({
  dataService: {
    getHypotheses: () => Promise.resolve([
      {
        hypothesis: 'Alpha hypothesis ADVANCE.',
        decision: 'ADVANCE',
        scores: { novelty: 9, scientific_plausibility: 8, potential_impact: 9, commercial_potential: 8 },
      },
      {
        hypothesis: 'Beta hypothesis ADVANCE.',
        decision: 'ADVANCE',
        scores: { novelty: 7, scientific_plausibility: 8, potential_impact: 7, commercial_potential: 8 },
      },
      {
        hypothesis: 'Gamma hypothesis BORDERLINE.',
        decision: 'BORDERLINE',
        scores: { novelty: 7, scientific_plausibility: 7, potential_impact: 8, commercial_potential: 6 },
      },
    ]),
    getDocuments: () => Promise.resolve([]),
    getGraph: () => Promise.resolve({ nodes: [], edges: [], blobs: [] }),
    getArgumentDetail: () => Promise.resolve({ argument: {}, relations: [], sources: [] }),
  },
}))

describe('DiscoverView', () => {
  it('renders all hypotheses on load', async () => {
    render(<DiscoverView />)
    await waitFor(() => {
      expect(screen.getByText('Alpha hypothesis ADVANCE.')).toBeInTheDocument()
      expect(screen.getByText('Beta hypothesis ADVANCE.')).toBeInTheDocument()
      expect(screen.getByText('Gamma hypothesis BORDERLINE.')).toBeInTheDocument()
    })
  })

  it('shows correct counts on filter chips', async () => {
    render(<DiscoverView />)
    await waitFor(() => {
      expect(screen.getByText('All 3')).toBeInTheDocument()
      expect(screen.getByText('ADVANCE 2')).toBeInTheDocument()
      expect(screen.getByText('BORDERLINE 1')).toBeInTheDocument()
    })
  })

  it('clicking ADVANCE filter shows only ADVANCE hypotheses', async () => {
    render(<DiscoverView />)
    await waitFor(() => screen.getByText('ADVANCE 2'))
    fireEvent.click(screen.getByText('ADVANCE 2'))
    expect(screen.getByText('Alpha hypothesis ADVANCE.')).toBeInTheDocument()
    expect(screen.getByText('Beta hypothesis ADVANCE.')).toBeInTheDocument()
    expect(screen.queryByText('Gamma hypothesis BORDERLINE.')).not.toBeInTheDocument()
  })

  it('clicking BORDERLINE filter shows only BORDERLINE hypotheses', async () => {
    render(<DiscoverView />)
    await waitFor(() => screen.getByText('BORDERLINE 1'))
    fireEvent.click(screen.getByText('BORDERLINE 1'))
    expect(screen.queryByText('Alpha hypothesis ADVANCE.')).not.toBeInTheDocument()
    expect(screen.getByText('Gamma hypothesis BORDERLINE.')).toBeInTheDocument()
  })

  it('clicking All resets the filter', async () => {
    render(<DiscoverView />)
    await waitFor(() => screen.getByText('ADVANCE 2'))
    fireEvent.click(screen.getByText('ADVANCE 2'))
    fireEvent.click(screen.getByText('All 3'))
    expect(screen.getByText('Gamma hypothesis BORDERLINE.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run -- tests/DiscoverView.test.tsx
```
Expected: FAIL — `Cannot find module '../src/views/DiscoverView/DiscoverView'`

- [ ] **Step 3: Create the CSS module**

Create `src/views/DiscoverView/DiscoverView.module.css`:
```css
.view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #fafbfc;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px 12px;
  border-bottom: 1px solid rgba(7, 59, 76, 0.08);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.title {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(7, 59, 76, 0.4);
  flex: 1;
  min-width: 120px;
}

.filterChip {
  font-size: 9px;
  font-weight: 700;
  border-radius: 10px;
  padding: 4px 11px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, color 0.15s;
}

.filterChipAll {
  background: rgba(7, 59, 76, 0.06);
  color: rgba(7, 59, 76, 0.55);
  border-color: rgba(7, 59, 76, 0.12);
}

.filterChipAll.filterActive {
  background: #073b4c;
  color: #fff;
  border-color: #073b4c;
}

.filterChipAdvance {
  background: rgba(6, 214, 160, 0.08);
  color: #06d6a0;
  border-color: rgba(6, 214, 160, 0.25);
}

.filterChipAdvance.filterActive {
  background: rgba(6, 214, 160, 0.18);
  border-color: #06d6a0;
}

.filterChipBorderline {
  background: rgba(244, 161, 36, 0.08);
  color: #F4A124;
  border-color: rgba(244, 161, 36, 0.25);
}

.filterChipBorderline.filterActive {
  background: rgba(244, 161, 36, 0.18);
  border-color: #F4A124;
}

.sortSelect {
  font-size: 9px;
  border: 1px solid rgba(7, 59, 76, 0.15);
  border-radius: 6px;
  padding: 4px 8px;
  color: #374151;
  background: #fff;
  cursor: pointer;
  outline: none;
}

.grid {
  flex: 1;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 16px 20px;
  align-content: start;
}

@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Create the `DiscoverView` component**

Create `src/views/DiscoverView/DiscoverView.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import { dataService } from '../../data/DataService'
import { HypothesisCard } from './HypothesisCard'
import type { Hypothesis } from '../../types'
import styles from './DiscoverView.module.css'

type FilterDecision = 'all' | 'ADVANCE' | 'BORDERLINE'
type SortBy = 'avg' | 'novelty' | 'scientific_plausibility' | 'potential_impact' | 'commercial_potential'

function avg(h: Hypothesis): number {
  const { novelty, scientific_plausibility, potential_impact, commercial_potential } = h.scores
  return (novelty + scientific_plausibility + potential_impact + commercial_potential) / 4
}

export function DiscoverView() {
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([])
  const [filterDecision, setFilterDecision] = useState<FilterDecision>('all')
  const [sortBy, setSortBy] = useState<SortBy>('avg')

  useEffect(() => {
    dataService.getHypotheses().then(setHypotheses)
  }, [])

  const advanceCount = hypotheses.filter(h => h.decision === 'ADVANCE').length
  const borderlineCount = hypotheses.filter(h => h.decision === 'BORDERLINE').length

  const displayed = useMemo(() => {
    const filtered = filterDecision === 'all'
      ? hypotheses
      : hypotheses.filter(h => h.decision === filterDecision)
    return [...filtered].sort((a, b) => {
      const va = sortBy === 'avg' ? avg(a) : a.scores[sortBy]
      const vb = sortBy === 'avg' ? avg(b) : b.scores[sortBy]
      return vb - va
    })
  }, [hypotheses, filterDecision, sortBy])

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <span className={styles.title}>Discovered Hypotheses</span>

        <button
          className={[styles.filterChip, styles.filterChipAll, filterDecision === 'all' ? styles.filterActive : ''].join(' ')}
          onClick={() => setFilterDecision('all')}
        >
          All {hypotheses.length}
        </button>
        <button
          className={[styles.filterChip, styles.filterChipAdvance, filterDecision === 'ADVANCE' ? styles.filterActive : ''].join(' ')}
          onClick={() => setFilterDecision('ADVANCE')}
        >
          ADVANCE {advanceCount}
        </button>
        <button
          className={[styles.filterChip, styles.filterChipBorderline, filterDecision === 'BORDERLINE' ? styles.filterActive : ''].join(' ')}
          onClick={() => setFilterDecision('BORDERLINE')}
        >
          BORDERLINE {borderlineCount}
        </button>

        <select
          className={styles.sortSelect}
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
        >
          <option value="avg">Sort: Avg score ↓</option>
          <option value="novelty">Sort: Novelty ↓</option>
          <option value="scientific_plausibility">Sort: Plausibility ↓</option>
          <option value="potential_impact">Sort: Impact ↓</option>
          <option value="commercial_potential">Sort: Commercial ↓</option>
        </select>
      </div>

      <div className={styles.grid}>
        {displayed.map((h, i) => (
          <HypothesisCard key={i} hypothesis={h} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm run test:run -- tests/DiscoverView.test.tsx
```
Expected: all 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/DiscoverView/DiscoverView.tsx src/views/DiscoverView/DiscoverView.module.css tests/DiscoverView.test.tsx
git commit -m "feat: add DiscoverView with filter/sort bar and hypothesis card grid"
```

---

## Task 6: Wire `App.tsx` and full smoke check

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `DiscoverView` to App**

Replace the entire contents of `src/App.tsx` with:
```tsx
import { Shell } from './components/Shell/Shell'
import { CorpusView } from './views/CorpusView/CorpusView'
import { GraphView } from './views/GraphView/GraphView'
import { DetailView } from './views/DetailView/DetailView'
import { DiscoverView } from './views/DiscoverView/DiscoverView'

export function App() {
  return (
    <Shell>
      <CorpusView />
      <GraphView />
      <DetailView />
      <DiscoverView />
    </Shell>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Run the full test suite**

```bash
npm run test:run
```
Expected: all tests PASS (DataService, store, HypothesisCard, DiscoverView)

- [ ] **Step 4: Start dev server and manually verify**

```bash
npm run dev
```
Open `http://localhost:5173/graphvisor/`. Verify:
- Top nav shows four tabs: Corpus, Graph, Detail, Discover
- Clicking "Discover" slides to the new view
- 8 hypothesis cards appear in a 2-column grid
- Cards show decision badge (green ADVANCE, orange BORDERLINE), avg score, hypothesis text, radar chart, score pills
- "ADVANCE" filter chip hides BORDERLINE cards
- "BORDERLINE" filter chip hides ADVANCE cards
- "All" resets the filter
- Sort dropdown reorders cards (try "Sort: Novelty ↓")

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire DiscoverView into App as fourth Shell panel"
```
