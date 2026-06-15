# Corpus Tab — Three Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Topics (clustered grid) and Timeline (beeswarm + relocated stats stream) views to the Corpus tab alongside the existing PCA Map, with a shared selection state and an impact (citation-based) size encoding.

**Architecture:** `CorpusView` becomes a shell that renders one of three sub-views via a segmented switcher, sharing the store's `selectedDocumentIds` and `ControlPanel`. Pure logic (k-means topic assignment + labeling, impact sizing, beeswarm layout, shared year-axis scale) lives in small tested modules under `src/views/CorpusView/`; React/D3 components consume them. Topic clustering and citations are precomputed once in `DataService`, mirroring the existing cached `PCA_SCORES`.

**Tech Stack:** React + TypeScript, D3 v7, Zustand store, Vitest, `ml-kmeans` (new), `ml-pca` (existing).

---

## File Structure

- `src/types/index.ts` — modify: `SizeBy`, `DocNode`, add `CorpusViewMode`, `Topic`.
- `src/data/corpus_final_dat.json` — modify: add `citations` to each doc.
- `src/data/DataService.ts` — modify: `RawDoc.citations`, topic clustering, `getTopics()`, doc `citations` + `topic_id`.
- `src/store/useStore.ts` — modify: add `corpusViewMode` + setter.
- `src/views/CorpusView/topics.ts` (new) — pure clustering helpers (`pickK`, `mostFrequentLabel`, `buildTopics`).
- `src/views/CorpusView/topics.test.ts` (new).
- `src/views/CorpusView/beeswarm.ts` (new) — deterministic `computeBeeswarm`.
- `src/views/CorpusView/beeswarm.test.ts` (new).
- `src/views/CorpusView/yearAxis.ts` (new) — shared `makeYearScale`.
- `src/views/CorpusView/yearAxis.test.ts` (new).
- `src/views/CorpusView/CorpusViewSwitcher.tsx` (new) — segmented control.
- `src/views/CorpusView/MapView.tsx` (new) — extracted PCA scatter.
- `src/views/CorpusView/TopicsView.tsx` (new) — grid.
- `src/views/CorpusView/TimelineView.tsx` (new) — split beeswarm + stats.
- `src/views/CorpusView/useCorpusD3.ts` — modify: `page_count` → `impact`.
- `src/views/CorpusView/CorpusStatsPanel.tsx` — modify: accept external year scale/padding.
- `src/views/CorpusView/CorpusView.tsx` — modify: becomes shell/switcher host.
- `package.json` — modify: add `ml-kmeans`.

---

## Task 1: Types — SizeBy, DocNode, CorpusViewMode, Topic

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Update SizeBy and DocNode, add new types**

In `src/types/index.ts`, change the `SizeBy` type and `DocNode` interface, and add two new types.

Replace:
```ts
export type SizeBy = 'argument_count' | 'uniform' | 'page_count'
```
with:
```ts
export type SizeBy = 'argument_count' | 'impact' | 'uniform'
export type CorpusViewMode = 'map' | 'topics' | 'timeline'
```

In the `DocNode` interface, replace the `page_count: number` line with:
```ts
  citations: number
  topic_id: number
```

Add after the `DocNode` interface:
```ts
export interface Topic {
  id: number
  label: string
  docIds: string[]
  argCount: number
}
```

- [ ] **Step 2: Verify the project still type-checks where DocNode/SizeBy are referenced**

Run: `npx tsc --noEmit`
Expected: FAIL — errors in `DataService.ts`, `CorpusView.tsx`, `useCorpusD3.ts` referencing `page_count`. These are fixed in later tasks. Confirm the only errors are about `page_count` / missing `citations`/`topic_id`, not syntax errors in the type file.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): impact size option, corpus view mode, Topic type"
```

---

## Task 2: Add citations to corpus JSON

**Files:**
- Modify: `src/data/corpus_final_dat.json`

- [ ] **Step 1: Add a citations field to each document**

Each of the 5 objects in the array needs a `citations` number added at the top level (sibling of `source`, `year`, `abstract`, `data`, `doc_embbeding`). Use these placeholder values (replace with real counts later) keyed by `source`:

- "Avoidance of inter-repeat recombination…" → `"citations": 142`
- "Cause commune et mecanisme commun aux maladies du vieillissement…" → `"citations": 38`
- "Bacterial Sex Playing Voyeurs 50 Years Later - Science" → `"citations": 87`
- "Biology of Extreme Radiation Resistance The Way of Deinococcus…" → `"citations": 215`
- "Cloning and expression of the Xenopus and mouse Msh2…" → `"citations": 96`

Add the key/value to each object (e.g. immediately after the `"year"` field). Preserve all existing fields and valid JSON.

- [ ] **Step 2: Verify JSON parses and every doc has citations**

Run: `node -e "const d=require('./src/data/corpus_final_dat.json'); console.log(d.length, d.every(x=>typeof x.citations==='number'))"`
Expected: `5 true`

- [ ] **Step 3: Commit**

```bash
git add src/data/corpus_final_dat.json
git commit -m "data: add placeholder citations to corpus docs"
```

---

## Task 3: Pure topic-clustering helpers

**Files:**
- Create: `src/views/CorpusView/topics.ts`
- Test: `src/views/CorpusView/topics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/views/CorpusView/topics.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pickK, mostFrequentLabel, buildTopics } from './topics'

describe('pickK', () => {
  it('adapts k = clamp(round(sqrt(n/2)), 2, 12), capped at n', () => {
    expect(pickK(5)).toBe(2)      // round(sqrt(2.5)) = 2
    expect(pickK(200)).toBe(10)   // round(sqrt(100)) = 10
    expect(pickK(1)).toBe(1)      // capped at n
    expect(pickK(2)).toBe(2)
    expect(pickK(1000)).toBe(12)  // clamped to max 12
  })
})

describe('mostFrequentLabel', () => {
  it('returns the most frequent label across docs', () => {
    expect(mostFrequentLabel([['a', 'b'], ['a'], ['c']])).toBe('a')
  })
  it('breaks ties lexicographically for determinism', () => {
    expect(mostFrequentLabel([['b'], ['a']])).toBe('a')
  })
  it('returns empty string when there are no labels', () => {
    expect(mostFrequentLabel([[], []])).toBe('')
  })
})

describe('buildTopics', () => {
  it('groups docs by cluster index with label, docIds, argCount', () => {
    const docs = [
      { id: 'doc_0', argument_count: 3 },
      { id: 'doc_1', argument_count: 5 },
      { id: 'doc_2', argument_count: 2 },
    ]
    const assignments = [0, 1, 0]
    const labels = new Map([[0, 'recombination'], [1, 'dna repair']])
    const topics = buildTopics(assignments, docs, labels)
    expect(topics).toEqual([
      { id: 0, label: 'recombination', docIds: ['doc_0', 'doc_2'], argCount: 5 },
      { id: 1, label: 'dna repair', docIds: ['doc_1'], argCount: 5 },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/views/CorpusView/topics.test.ts`
Expected: FAIL — `topics.ts` does not exist / functions undefined.

- [ ] **Step 3: Implement the helpers**

Create `src/views/CorpusView/topics.ts`:
```ts
import type { Topic } from '../../types'

/** Adaptive cluster count: clamp(round(sqrt(n/2)), 2, 12), never exceeding n. */
export function pickK(n: number): number {
  const raw = Math.round(Math.sqrt(n / 2))
  const clamped = Math.max(2, Math.min(12, raw))
  return Math.min(clamped, n)
}

/** Most frequent label across docs; ties broken lexicographically. '' if none. */
export function mostFrequentLabel(labelLists: string[][]): string {
  const counts = new Map<string, number>()
  for (const list of labelLists)
    for (const label of list) counts.set(label, (counts.get(label) ?? 0) + 1)
  let best = ''
  let bestCount = 0
  for (const [label, count] of counts) {
    if (count > bestCount || (count === bestCount && (best === '' || label < best))) {
      best = label
      bestCount = count
    }
  }
  return best
}

/** Group docs by their cluster assignment into Topic records. */
export function buildTopics(
  assignments: number[],
  docs: { id: string; argument_count: number }[],
  labels: Map<number, string>,
): Topic[] {
  const byCluster = new Map<number, { docIds: string[]; argCount: number }>()
  docs.forEach((doc, i) => {
    const c = assignments[i]
    if (!byCluster.has(c)) byCluster.set(c, { docIds: [], argCount: 0 })
    const entry = byCluster.get(c)!
    entry.docIds.push(doc.id)
    entry.argCount += doc.argument_count
  })
  return Array.from(byCluster.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, { docIds, argCount }]) => ({
      id,
      label: labels.get(id) ?? `Topic ${id}`,
      docIds,
      argCount,
    }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/views/CorpusView/topics.test.ts`
Expected: PASS (3 suites, all green).

- [ ] **Step 5: Commit**

```bash
git add src/views/CorpusView/topics.ts src/views/CorpusView/topics.test.ts
git commit -m "feat(corpus): pure topic-clustering helpers"
```

---

## Task 4: Add ml-kmeans dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install ml-kmeans**

Run: `npm install ml-kmeans`
Expected: adds `ml-kmeans` to `dependencies`, exits 0.

- [ ] **Step 2: Verify it imports**

Run: `node -e "const {kmeans}=require('ml-kmeans'); const r=kmeans([[1,1],[1,2],[9,9],[9,8]],2,{seed:42}); console.log(Array.isArray(r.clusters), r.clusters.length)"`
Expected: `true 4`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add ml-kmeans dependency"
```

---

## Task 5: DataService — citations, topic clustering, getTopics

**Files:**
- Modify: `src/data/DataService.ts`

- [ ] **Step 1: Add citations to RawDoc and import kmeans + helpers**

In `src/data/DataService.ts`, add to the top imports:
```ts
import { kmeans } from 'ml-kmeans'
import { pickK, mostFrequentLabel, buildTopics } from '../views/CorpusView/topics'
import type { Topic } from '../types'
```
(Merge `Topic` into the existing `../types` import if you prefer a single import line.)

Add `citations: number` to the `RawDoc` type:
```ts
type RawDoc = {
  source: string
  year: string
  abstract: string
  citations: number
  data: RawArgument[]
  doc_embbeding: number[]
}
```

- [ ] **Step 2: Add the interface method**

In `DataServiceInterface`, add:
```ts
  getTopics(): Promise<Topic[]>
```

- [ ] **Step 3: Compute cached topic assignments after PCA_SCORES**

Add immediately after the `PCA_SCORES` IIFE block:
```ts
// ── Topic clustering from stored embeddings ──────────────────────────────────
const TOPIC_DATA: { assignments: number[]; topics: Topic[] } = (() => {
  const n = rawDocs.length
  const embeddings = rawDocs.map(d => d.doc_embbeding)
  const k = pickK(n)
  const { clusters } = kmeans(embeddings, k, { seed: 42 })

  // Per-cluster label from member docs' parent_concepts (fallback: top terms)
  const labels = new Map<number, string>()
  for (let c = 0; c < k; c++) {
    const memberConcepts: string[][] = []
    const memberTerms: string[][] = []
    rawDocs.forEach((doc, i) => {
      if (clusters[i] !== c) return
      memberConcepts.push(doc.data.flatMap(a => a.concept_level?.parent_concepts ?? []))
      const termCounts: Record<string, number> = {}
      doc.data.forEach(arg => arg.relations.forEach(rel => {
        termCounts[rel.subject] = (termCounts[rel.subject] || 0) + 1
        termCounts[rel.object] = (termCounts[rel.object] || 0) + 1
      }))
      memberTerms.push(Object.entries(termCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t))
    })
    const conceptLabel = mostFrequentLabel(memberConcepts)
    labels.set(c, conceptLabel || mostFrequentLabel(memberTerms) || `Topic ${c + 1}`)
  }

  const docMeta = rawDocs.map((doc, i) => ({ id: makeDocId(i), argument_count: doc.data.length }))
  const topics = buildTopics(Array.from(clusters), docMeta, labels)
  return { assignments: Array.from(clusters), topics }
})()
```

- [ ] **Step 4: Attach citations + topic_id in buildDocs**

In `buildDocs()`, replace the returned object's `page_count: 0,` line with:
```ts
      citations: doc.citations,
      topic_id: TOPIC_DATA.assignments[i],
```

- [ ] **Step 5: Implement getTopics in RealDataService**

Add this method to `RealDataService` (next to `getDocuments`):
```ts
  async getTopics(): Promise<Topic[]> {
    return TOPIC_DATA.topics
  }
```

- [ ] **Step 6: Verify type-check passes for DataService**

Run: `npx tsc --noEmit 2>&1 | grep DataService`
Expected: no output (no DataService errors). Other files (`CorpusView.tsx`, `useCorpusD3.ts`) may still error on `page_count`; fixed next.

- [ ] **Step 7: Commit**

```bash
git add src/data/DataService.ts
git commit -m "feat(data): cluster docs into topics, expose citations + getTopics"
```

---

## Task 6: Store — corpus view mode

**Files:**
- Modify: `src/store/useStore.ts`

- [ ] **Step 1: Add corpusViewMode state and setter**

In `src/store/useStore.ts`, add `CorpusViewMode` to the type import:
```ts
import type { FilterState, ActiveView, SizeBy, CorpusViewMode } from '../types'
```

In the `AppState` interface, after `activeView: ActiveView`, add:
```ts
  corpusViewMode: CorpusViewMode
```
and after `setActiveView`, add:
```ts
  setCorpusViewMode: (mode: CorpusViewMode) => void
```

In the store body, after `activeView: 'corpus',` add:
```ts
  corpusViewMode: 'map',
```
and after the `setActiveView` implementation, add:
```ts
  setCorpusViewMode: (mode) => set({ corpusViewMode: mode }),
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep useStore`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat(store): corpus view mode state"
```

---

## Task 7: Map view size encoding — page_count → impact

**Files:**
- Modify: `src/views/CorpusView/useCorpusD3.ts`

- [ ] **Step 1: Swap the size metric from page_count to citations**

In `src/views/CorpusView/useCorpusD3.ts`, in the size computation, replace:
```ts
    const sizeVals = docs.map(dd => opts.sizeBy === 'argument_count' ? dd.argument_count : dd.page_count)
```
with:
```ts
    const sizeVals = docs.map(dd => opts.sizeBy === 'argument_count' ? dd.argument_count : dd.citations)
```
and in `getRadius`, replace:
```ts
      const val = opts.sizeBy === 'argument_count' ? d.argument_count : d.page_count
```
with:
```ts
      const val = opts.sizeBy === 'argument_count' ? d.argument_count : d.citations
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep useCorpusD3`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/views/CorpusView/useCorpusD3.ts
git commit -m "feat(corpus): size map dots by impact (citations)"
```

---

## Task 8: Shared year-axis scale helper

**Files:**
- Create: `src/views/CorpusView/yearAxis.ts`
- Test: `src/views/CorpusView/yearAxis.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/CorpusView/yearAxis.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { makeYearScale } from './yearAxis'

describe('makeYearScale', () => {
  it('maps min year to left and max year to right', () => {
    const s = makeYearScale([1991, 2003, 2020], 30, 270)
    expect(s.domain).toEqual([1991, 2020])
    expect(s.scale(1991)).toBeCloseTo(30)
    expect(s.scale(2020)).toBeCloseTo(270)
    expect(s.scale(2005.5)).toBeCloseTo(150) // midpoint
  })
  it('handles a single year by centering it', () => {
    const s = makeYearScale([2000], 30, 270)
    expect(s.domain).toEqual([2000, 2000])
    expect(s.scale(2000)).toBeCloseTo(150)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/CorpusView/yearAxis.test.ts`
Expected: FAIL — `yearAxis.ts` does not exist.

- [ ] **Step 3: Implement makeYearScale**

Create `src/views/CorpusView/yearAxis.ts`:
```ts
export interface YearScale {
  domain: [number, number]
  scale: (year: number) => number
}

/**
 * Linear year → x-pixel mapping shared by the timeline beeswarm and the stats
 * stream so their axes align. `left`/`right` are inner pixel bounds.
 */
export function makeYearScale(years: number[], left: number, right: number): YearScale {
  const min = Math.min(...years)
  const max = Math.max(...years)
  const span = max - min
  const scale = (year: number) =>
    span === 0 ? (left + right) / 2 : left + ((year - min) / span) * (right - left)
  return { domain: [min, max], scale }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/CorpusView/yearAxis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/CorpusView/yearAxis.ts src/views/CorpusView/yearAxis.test.ts
git commit -m "feat(corpus): shared year-axis scale helper"
```

---

## Task 9: Deterministic beeswarm layout

**Files:**
- Create: `src/views/CorpusView/beeswarm.ts`
- Test: `src/views/CorpusView/beeswarm.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/views/CorpusView/beeswarm.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeBeeswarm } from './beeswarm'

describe('computeBeeswarm', () => {
  const xOf = (year: number) => year - 1990 // simple deterministic x mapping

  it('places each item at its year x and centers a lone item', () => {
    const pos = computeBeeswarm([{ id: 'a', year: 2000 }], { xOf, centerY: 50, radius: 5 })
    expect(pos.get('a')).toEqual({ x: 10, y: 50 })
  })

  it('separates same-year items by at least the diameter on y', () => {
    const pos = computeBeeswarm(
      [{ id: 'a', year: 2000 }, { id: 'b', year: 2000 }, { id: 'c', year: 2000 }],
      { xOf, centerY: 50, radius: 5 },
    )
    const ys = ['a', 'b', 'c'].map(id => pos.get(id)!.y).sort((m, n) => m - n)
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(10)
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(10)
    // all share the same x
    expect(new Set(['a', 'b', 'c'].map(id => pos.get(id)!.x)).size).toBe(1)
  })

  it('is deterministic across runs', () => {
    const items = [{ id: 'a', year: 2000 }, { id: 'b', year: 2000 }, { id: 'c', year: 2001 }]
    const opts = { xOf, centerY: 50, radius: 5 }
    expect(computeBeeswarm(items, opts)).toEqual(computeBeeswarm(items, opts))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/CorpusView/beeswarm.test.ts`
Expected: FAIL — `beeswarm.ts` does not exist.

- [ ] **Step 3: Implement computeBeeswarm**

Create `src/views/CorpusView/beeswarm.ts`:
```ts
export interface BeeswarmItem { id: string; year: number }
export interface BeeswarmOpts {
  xOf: (year: number) => number
  centerY: number
  radius: number
}

/**
 * Deterministic beeswarm: x is fixed to the item's year; same-year items are
 * stacked alternately above/below centerY, separated by at least one diameter.
 * y carries no value meaning — it is pure collision spacing (density).
 */
export function computeBeeswarm(
  items: BeeswarmItem[],
  { xOf, centerY, radius }: BeeswarmOpts,
): Map<string, { x: number; y: number }> {
  const diameter = radius * 2
  const byYear = new Map<number, BeeswarmItem[]>()
  for (const it of items) {
    if (!byYear.has(it.year)) byYear.set(it.year, [])
    byYear.get(it.year)!.push(it)
  }

  const pos = new Map<string, { x: number; y: number }>()
  for (const [year, group] of byYear) {
    // Stable order within a year for determinism
    group.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const x = xOf(year)
    group.forEach((it, i) => {
      // 0 → center, 1 → +d, 2 → -d, 3 → +2d, 4 → -2d, ...
      const rank = Math.ceil(i / 2)
      const sign = i % 2 === 1 ? 1 : -1
      const y = centerY + (i === 0 ? 0 : sign * rank * diameter)
      pos.set(it.id, { x, y })
    })
  }
  return pos
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/CorpusView/beeswarm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/CorpusView/beeswarm.ts src/views/CorpusView/beeswarm.test.ts
git commit -m "feat(corpus): deterministic beeswarm layout"
```

---

## Task 10: Corpus view switcher (segmented control)

**Files:**
- Create: `src/views/CorpusView/CorpusViewSwitcher.tsx`

- [ ] **Step 1: Implement the switcher**

Create `src/views/CorpusView/CorpusViewSwitcher.tsx`:
```tsx
import type { CorpusViewMode } from '../../types'

const MODES: { value: CorpusViewMode; label: string }[] = [
  { value: 'topics', label: '▦ Topics' },
  { value: 'map', label: '⊙ Map' },
  { value: 'timeline', label: '▭ Timeline' },
]

interface Props {
  mode: CorpusViewMode
  onChange: (mode: CorpusViewMode) => void
}

export function CorpusViewSwitcher({ mode, onChange }: Props) {
  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', background: '#fff', borderRadius: 10, padding: 3,
      boxShadow: '0 2px 8px rgba(7,59,76,0.12)', zIndex: 20,
    }}>
      {MODES.map(m => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          style={{
            border: 'none', cursor: 'pointer', borderRadius: 7, padding: '6px 14px',
            fontSize: 11, fontWeight: 700,
            background: mode === m.value ? '#073b4c' : 'transparent',
            color: mode === m.value ? '#fff' : '#64748b',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep CorpusViewSwitcher`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/views/CorpusView/CorpusViewSwitcher.tsx
git commit -m "feat(corpus): view-mode segmented switcher"
```

---

## Task 11: Extract MapView from CorpusView

**Files:**
- Create: `src/views/CorpusView/MapView.tsx`

This task moves the existing scatter (svg + tooltip + `useCorpusD3` wiring) into its own component. `CorpusView` will render it in Task 14. The component receives already-filtered docs and selection callbacks as props so all three views share filtering logic in the shell.

- [ ] **Step 1: Create MapView**

Create `src/views/CorpusView/MapView.tsx`:
```tsx
import { useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { useCorpusD3 } from './useCorpusD3'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

interface Props {
  docs: DocNode[]
  selectedIds: Set<string>
}

export function MapView({ docs, selectedIds }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection, sizeBy,
  } = useStore()

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
    <>
      <svg ref={svgRef} className={styles.svg} />
      <div className={styles.lassoChip}>LASSO</div>
      {tooltip && (
        <FloatingCard style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
            {tooltip.doc.title}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>
            {tooltip.doc.citations} citations · {tooltip.doc.argument_count} arguments
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
            {tooltip.doc.top_terms.join(' · ')}
          </div>
        </FloatingCard>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep MapView`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/views/CorpusView/MapView.tsx
git commit -m "feat(corpus): extract MapView component"
```

---

## Task 12: TopicsView grid

**Files:**
- Create: `src/views/CorpusView/TopicsView.tsx`

- [ ] **Step 1: Implement the grid**

Each tile is a topic; docs render as rounded mini-squares. Clicking a mini-square toggles that doc (shift extends); clicking the tile body selects all docs in the topic. Hovering a mini-square shows the doc tooltip.

Create `src/views/CorpusView/TopicsView.tsx`:
```tsx
import { useEffect, useState, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import type { DocNode, Topic } from '../../types'

interface Props {
  docs: DocNode[]
  selectedIds: Set<string>
}

const SELECTED = '#ef476f'
const UNSELECTED = '#74b9d6'

export function TopicsView({ docs, selectedIds }: Props) {
  const [topics, setTopics] = useState<Topic[]>([])
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection, selectAll,
  } = useStore()

  useEffect(() => { dataService.getTopics().then(setTopics) }, [])

  const docById = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs])

  // Only topics that still have visible docs after filtering
  const visibleTopics = useMemo(
    () => topics
      .map(t => ({ ...t, docIds: t.docIds.filter(id => docById.has(id)) }))
      .filter(t => t.docIds.length > 0),
    [topics, docById],
  )

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 24, paddingTop: 64, background: '#fafbfc' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14,
      }}>
        {visibleTopics.map(topic => {
          const allSelected = topic.docIds.every(id => selectedIds.has(id))
          return (
            <div
              key={topic.id}
              onClick={() => {
                if (allSelected) setSelectedDocuments(selectedDocumentIds.filter(id => !topic.docIds.includes(id)))
                else selectAll([...new Set([...selectedDocumentIds, ...topic.docIds])])
              }}
              style={{
                border: '1px solid rgba(7,59,76,0.15)', borderRadius: 12, padding: 12,
                background: '#fff', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: '#073b4c', marginBottom: 2 }}>
                {topic.label}
              </div>
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 8 }}>
                {topic.docIds.length} docs · {topic.argCount} args
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {topic.docIds.map(id => {
                  const doc = docById.get(id)!
                  return (
                    <span
                      key={id}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (e.shiftKey) toggleDocumentSelection(id)
                        else setSelectedDocuments(selectedDocumentIds.includes(id) ? selectedDocumentIds.filter(x => x !== id) : [...selectedDocumentIds, id])
                      }}
                      onMouseEnter={(e) => setTooltip({ doc, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        width: 16, height: 16, borderRadius: 5, cursor: 'pointer',
                        background: selectedIds.has(id) ? SELECTED : UNSELECTED,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {tooltip && (
        <FloatingCard style={{ position: 'fixed', left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
            {tooltip.doc.title}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>
            {tooltip.doc.citations} citations · {tooltip.doc.argument_count} arguments
          </div>
        </FloatingCard>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep TopicsView`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/views/CorpusView/TopicsView.tsx
git commit -m "feat(corpus): topics grid view"
```

---

## Task 13: CorpusStatsPanel — accept external year scale

**Files:**
- Modify: `src/views/CorpusView/CorpusStatsPanel.tsx`

The stats panel currently computes its own x-scale from `years` and uses `PAD.left=32, PAD.right=88`. To align with the beeswarm, let it accept an optional external x-scale (a `(year) => number` plus explicit inner left/right pixel bounds). When not provided, it falls back to today's behavior (so any other caller is unaffected).

- [ ] **Step 1: Add optional props**

In `src/views/CorpusView/CorpusStatsPanel.tsx`, extend the `Props` interface:
```ts
interface Props {
  docs: DocNode[]
  height: number
  /** Optional external x mapping so the timeline beeswarm and stream align. */
  xScale?: (year: number) => number
  padLeft?: number
  padRight?: number
}
```

- [ ] **Step 2: Use external scale when provided**

In the component signature, destructure the new props:
```ts
export function CorpusStatsPanel({ docs, height, xScale: extXScale, padLeft, padRight }: Props) {
```

Inside `draw()`, after `const { width } = el.getBoundingClientRect()`, replace the `PAD` constant with:
```ts
    const PAD = {
      top: 12, bottom: 24,
      left: padLeft ?? 32,
      right: padRight ?? 88,
    }
```

Then replace the local `xScale` definition:
```ts
    const xScale = d3.scaleLinear().domain([yearStart, yearEnd]).range([0, chartW])
```
with one that honors the external mapping (translated into the chart's local coordinate space, since the chart group is already offset by `PAD.left`):
```ts
    const xScale = extXScale
      ? d3.scaleLinear()
          .domain([yearStart, yearEnd])
          .range([extXScale(yearStart) - PAD.left, extXScale(yearEnd) - PAD.left])
      : d3.scaleLinear().domain([yearStart, yearEnd]).range([0, chartW])
```

- [ ] **Step 3: Add new props to the effect dependency array**

Change the effect dependency array at the end of the `useEffect` from:
```ts
  }, [terms, years, yearTermCounts, height])
```
to:
```ts
  }, [terms, years, yearTermCounts, height, extXScale, padLeft, padRight])
```

- [ ] **Step 4: Verify type-check and existing behavior**

Run: `npx tsc --noEmit 2>&1 | grep CorpusStatsPanel`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/views/CorpusView/CorpusStatsPanel.tsx
git commit -m "feat(corpus): stats panel accepts external aligned x-scale"
```

---

## Task 14: TimelineView (beeswarm + stats, aligned)

**Files:**
- Create: `src/views/CorpusView/TimelineView.tsx`

The view stacks a beeswarm (top) over `CorpusStatsPanel` (bottom). Both use `makeYearScale` over the same year domain and identical inner left/right padding so the axes align. Dots are sized by the active representation and support click/shift-click + tooltip (lasso is Map-only to keep this task bounded).

- [ ] **Step 1: Implement TimelineView**

Create `src/views/CorpusView/TimelineView.tsx`:
```tsx
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
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit 2>&1 | grep TimelineView`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/views/CorpusView/TimelineView.tsx
git commit -m "feat(corpus): timeline beeswarm aligned with stats stream"
```

---

## Task 15: CorpusView shell — wire switcher + three views, drop drawer

**Files:**
- Modify: `src/views/CorpusView/CorpusView.tsx`

`CorpusView` keeps doc loading, filtering, and the `ControlPanel` (filter/legend/size), renders the switcher, and shows one sub-view. The pull-up stats drawer and its `DRAWER_HEIGHT`/`drawerOpen` state are removed. The size-by min filter follows arg/impact.

- [ ] **Step 1: Rewrite CorpusView as the shell**

Replace the entire contents of `src/views/CorpusView/CorpusView.tsx` with:
```tsx
import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { ControlPanel } from '../../components/ControlPanel/ControlPanel'
import { CorpusViewSwitcher } from './CorpusViewSwitcher'
import { MapView } from './MapView'
import { TopicsView } from './TopicsView'
import { TimelineView } from './TimelineView'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

export function CorpusView() {
  const [docs, setDocs] = useState<DocNode[]>([])
  const [minArgCount, setMinArgCount] = useState(0)
  const [minImpact, setMinImpact] = useState(0)
  const {
    activeView, corpusViewMode, setCorpusViewMode,
    selectedDocumentIds, clearSelection, selectAll, setSizeBy, sizeBy,
  } = useStore()

  const isActive = activeView === 'corpus'
  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  const argMax = useMemo(() => docs.length ? Math.max(...docs.map(d => d.argument_count)) : 100, [docs])
  const impactMax = useMemo(() => docs.length ? Math.max(...docs.map(d => d.citations)) : 100, [docs])

  const filteredDocs = useMemo(
    () => docs.filter(d => d.argument_count >= minArgCount && d.citations >= minImpact),
    [docs, minArgCount, minImpact],
  )

  const sizeExtent = useMemo<[number, number]>(() => {
    if (!filteredDocs.length || sizeBy === 'uniform') return [0, 0]
    const vals = filteredDocs.map(d => sizeBy === 'argument_count' ? d.argument_count : d.citations)
    return [Math.min(...vals), Math.max(...vals)]
  }, [filteredDocs, sizeBy])

  const sizeByLabel = sizeBy === 'argument_count' ? 'arguments' : sizeBy === 'impact' ? 'citations' : ''

  const filterContent = (
    <>
      <div>
        <div className="sl">Selection</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#073b4c' }}>
            {selectedDocumentIds.length} / {filteredDocs.length} selected
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={clearSelection} style={btnStyle}>Clear</button>
          <button onClick={() => selectAll(filteredDocs.map(d => d.id))} style={btnStyle}>All</button>
        </div>
      </div>

      <div>
        <div className="sl">Size by</div>
        {([['argument_count', 'Argument count'], ['impact', 'Impact (citations)'], ['uniform', 'Uniform']] as const).map(([val, lbl]) => (
          <label key={val} style={radioRow}>
            <input type="radio" name="corpus-size" checked={sizeBy === val} onChange={() => setSizeBy(val)}
              style={{ accentColor: '#F4A124' }} />
            <span style={labelText}>{lbl}</span>
          </label>
        ))}
      </div>

      {sizeBy !== 'uniform' && (
        <div>
          <div className="sl">Min {sizeBy === 'argument_count' ? 'arguments' : 'citations'}</div>
          <input type="range" min={0} max={sizeBy === 'argument_count' ? argMax : impactMax} step={1}
            value={sizeBy === 'argument_count' ? minArgCount : minImpact}
            onChange={e => sizeBy === 'argument_count' ? setMinArgCount(Number(e.target.value)) : setMinImpact(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#F4A124', marginBottom: 4 }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: '#F4A124' }}>
            ≥ {sizeBy === 'argument_count' ? minArgCount : minImpact}
            <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 4 }}>
              ({filteredDocs.length} docs shown)
            </span>
          </div>
        </div>
      )}
    </>
  )

  const legendContent = (
    <>
      <div>
        <div className="sl">Document dots</div>
        {([['#74b9d6', 'Unselected'], ['#ef476f', 'Selected']] as const).map(([color, lbl]) => (
          <div key={lbl} style={legendRow}>
            <span style={{ ...dot, background: color }} />
            <span style={legendText}>{lbl}</span>
          </div>
        ))}
      </div>

      {sizeBy !== 'uniform' && corpusViewMode !== 'topics' && (
        <div>
          <div className="sl">Size by {sizeByLabel}</div>
          <div style={legendRow}>
            <span style={{ ...dot, width: 8, height: 8, background: '#74b9d6' }} />
            <span style={{ ...legendText, color: '#9ca3af' }}>{sizeExtent[0]} {sizeByLabel} (min)</span>
          </div>
          <div style={legendRow}>
            <span style={{ ...dot, width: 18, height: 18, background: '#74b9d6' }} />
            <span style={{ ...legendText, color: '#374151' }}>{sizeExtent[1]} {sizeByLabel} (max)</span>
          </div>
        </div>
      )}

      <div>
        <div className="sl">Interactions</div>
        <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.6 }}>
          <div>Click — select single doc</div>
          <div>Shift+click — multi-select</div>
          {corpusViewMode === 'map' && <div>Drag — lasso select</div>}
          {corpusViewMode === 'topics' && <div>Click tile — select topic</div>}
        </div>
      </div>
    </>
  )

  return (
    <div className={styles.view}>
      <div className={styles.canvas}>
        <CorpusViewSwitcher mode={corpusViewMode} onChange={setCorpusViewMode} />

        {corpusViewMode === 'map' && <MapView docs={filteredDocs} selectedIds={selectedIds} />}
        {corpusViewMode === 'topics' && <TopicsView docs={filteredDocs} selectedIds={selectedIds} />}
        {corpusViewMode === 'timeline' && <TimelineView docs={filteredDocs} selectedIds={selectedIds} />}

        <ControlPanel
          isActive={isActive}
          filterContent={filterContent}
          legendContent={legendContent}
          fabBottom={20}
          fabLeft={20}
        />
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  flex: 1, background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
const radioRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }
const labelText: React.CSSProperties = { fontSize: 11, color: '#374151' }
const legendRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }
const dot: React.CSSProperties = { width: 10, height: 10, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }
const legendText: React.CSSProperties = { fontSize: 11, color: '#374151' }
```

- [ ] **Step 2: Verify full type-check passes**

Run: `npx tsc --noEmit`
Expected: PASS (no errors anywhere — `page_count` fully removed).

- [ ] **Step 3: Verify the full test suite passes**

Run: `npx vitest run`
Expected: PASS (all suites including topics/beeswarm/yearAxis).

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`
Expected: exits 0. Fix any unused-import warnings (e.g. remove now-unused imports left over from the old CorpusView).

- [ ] **Step 5: Manual verification in the browser**

Run: `npm run dev`, open the app, go to the Corpus tab.
Verify:
- Switcher shows Topics / Map / Timeline; Map is the default and looks like before.
- "Size by" offers Argument count / Impact (citations) / Uniform; switching to Impact resizes dots; the min-filter label changes to "Min citations".
- Topics view shows topic tiles with rounded mini-squares; clicking a square selects one doc, clicking a tile selects all docs in it; selection color matches Map.
- Timeline view shows the beeswarm on top and the stats stream below, with year ticks lining up vertically between the two.
- No pull-up "Corpus Statistics" drawer remains in any view.
- Selecting docs in one view shows the same selection when switching views.

- [ ] **Step 6: Commit**

```bash
git add src/views/CorpusView/CorpusView.tsx
git commit -m "feat(corpus): three-view shell with switcher, drop stats drawer"
```

---

## Task 16: Clean up unused CSS drawer styles

**Files:**
- Modify: `src/views/CorpusView/CorpusView.module.css`

- [ ] **Step 1: Remove dead drawer styles**

Open `src/views/CorpusView/CorpusView.module.css` and remove the now-unused drawer rules (`.drawer`, `.drawerTab`, `.drawerTabLabel`, `.drawerTabArrow`, `.drawerBody` and any drawer-only helpers). Keep `.view`, `.canvas`, `.svg`, `.lassoChip` and anything still referenced.

- [ ] **Step 2: Verify nothing references removed classes**

Run: `grep -rn "drawer" src/views/CorpusView/`
Expected: no matches.

- [ ] **Step 3: Verify build still passes**

Run: `npm run lint && npx tsc --noEmit`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/views/CorpusView/CorpusView.module.css
git commit -m "chore(corpus): remove dead stats-drawer styles"
```

---

## Self-Review Notes

- **Spec coverage:** navigation/switcher (T6, T10, T15), impact field + citations (T1, T2, T5, T7), representation control (T15), Map unchanged (T7, T11), Topics clustering + uniform tiles + mini-squares + dual selection (T3, T4, T5, T12), Timeline beeswarm + relocated stats + aligned axes (T8, T9, T13, T14), drawer removal (T15, T16), tests (T3, T8, T9). All spec sections map to tasks.
- **Type consistency:** `Topic { id, label, docIds, argCount }`, `SizeBy 'argument_count' | 'impact' | 'uniform'`, `DocNode.citations`/`topic_id`, `makeYearScale → { domain, scale }`, `computeBeeswarm(items, { xOf, centerY, radius })` used consistently across DataService, TimelineView, and tests.
