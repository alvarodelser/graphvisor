# GraphVisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build GraphVisor — a React + D3 SPA with three views (Corpus scatter, Knowledge Graph, Argument Detail) connected by a shared Zustand store and CSS slide transitions.

**Architecture:** Each view owns a custom D3 hook that manages SVG rendering imperatively via a React ref. All data access goes through a `DataService` interface backed by mock JSON fixtures (Phase 1). The Shell renders all three views in a slide track; only the active one is visible.

**Tech Stack:** React 18, TypeScript, D3 v7, Zustand, Vite, Vitest + jsdom

---

## File Map

```
src/
  types/index.ts                 — All shared TypeScript interfaces
  utils/geometry.ts              — isPointInPolygon, computeRadialTiers, RELATION_COLORS
  data/
    DataService.ts               — Interface + MockDataService
    mock/documents.json          — 20 mock documents
    mock/graph.json              — 18 nodes, 22 edges
    mock/detail.json             — ArgumentDetail for arg_001
  store/useStore.ts              — Zustand store
  styles/global.css              — .card, .card-mid, .sl, body reset
  components/
    FloatingCard/FloatingCard.tsx + .module.css
    StatusBar/StatusBar.tsx + .module.css
    Shell/Shell.tsx + .module.css
    FilterRail/FilterRail.tsx + .module.css
  views/
    CorpusView/
      CorpusView.tsx + .module.css
      useCorpusD3.ts
      CorpusToolbar.tsx
      CorpusFilterRail.tsx
    GraphView/
      GraphView.tsx + .module.css
      useGraphD3.ts
      NodeDetailCard.tsx
      GraphFilterRail.tsx
    DetailView/
      DetailView.tsx + .module.css
      DetailMiniMap.tsx
      RelationList.tsx
      DetailFilterRail.tsx
  App.tsx
  main.tsx
tests/
  geometry.test.ts
  DataService.test.ts
  store.test.ts
```

---

### Task 1: Scaffold + Configure

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/test-setup.ts`

- [ ] **Step 1: Scaffold Vite project**

Run inside `/Users/alvarodelser/Projects/GraphVisor`:
```bash
npm create vite@latest . -- --template react-ts --force
```
When prompted to overwrite, confirm yes. Expected: Vite scaffold with `src/main.tsx`, `src/App.tsx`.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install d3 zustand
npm install --save-dev @types/d3
```

- [ ] **Step 3: Install test dependencies**

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @vitejs/plugin-react
```

- [ ] **Step 4: Replace vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
})
```

- [ ] **Step 5: Create src/test-setup.ts**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Add test script to package.json**

In `package.json`, ensure scripts contains:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```
Expected: "Local: http://localhost:5173" — open in browser, default Vite React page renders.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/
git commit -m "feat: scaffold Vite React TS project with Vitest"
```

---

### Task 2: Types + Geometry Utils + Tests

**Files:**
- Create: `src/types/index.ts`
- Create: `src/utils/geometry.ts`
- Create: `tests/geometry.test.ts`

- [ ] **Step 1: Write geometry tests (failing)**

```typescript
// tests/geometry.test.ts
import { describe, it, expect } from 'vitest'
import { isPointInPolygon, computeRadialTiers } from '../src/utils/geometry'

const square: [number, number][] = [[0,0],[100,0],[100,100],[0,100]]

describe('isPointInPolygon', () => {
  it('returns true for a point inside', () => {
    expect(isPointInPolygon([50, 50], square)).toBe(true)
  })
  it('returns false for a point outside', () => {
    expect(isPointInPolygon([150, 50], square)).toBe(false)
  })
  it('returns false for a point above', () => {
    expect(isPointInPolygon([50, 150], square)).toBe(false)
  })
})

describe('computeRadialTiers', () => {
  const nodes = [
    { id: 'a1', type: 'Argument' },
    { id: 'a2', type: 'Argument' },
    { id: 'a3', type: 'Argument' },
    { id: 'a4', type: 'Argument' },
    { id: 'e1', type: 'Entity' },
  ]
  const edges = [
    { source: 'a1', target: 'a2' },
    { source: 'a1', target: 'a3' },
    { source: 'a1', target: 'a4' },
    { source: 'a2', target: 'a3' },
  ]

  it('assigns tier 0 to highest-degree argument', () => {
    const tiers = computeRadialTiers(nodes, edges)
    expect(tiers.get('a1')).toBe(0)
  })
  it('does not include Entity nodes', () => {
    const tiers = computeRadialTiers(nodes, edges)
    expect(tiers.has('e1')).toBe(false)
  })
  it('assigns higher tier to lowest-degree argument', () => {
    const tiers = computeRadialTiers(nodes, edges)
    expect(tiers.get('a1')!).toBeLessThan(tiers.get('a4')!)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm run test:run -- tests/geometry.test.ts
```
Expected: FAIL — "Cannot find module '../src/utils/geometry'"

- [ ] **Step 3: Create src/types/index.ts**

```typescript
import type * as d3 from 'd3'

export interface DocNode {
  id: string
  title: string
  umap_x: number
  umap_y: number
  pca_x: number
  pca_y: number
  argument_count: number
  page_count: number
  top_terms: string[]
  // injected by D3 simulation
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null
}

export type GraphNodeType = 'Argument' | 'Entity' | 'Concept'
export type RelationGroup = 'positive' | 'negative' | 'causal' | 'structural'
export type ActiveView = 'corpus' | 'graph' | 'detail'
export type Projection = 'umap' | 'pca'
export type SizeBy = 'argument_count' | 'uniform' | 'page_count'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  full_text?: string
  confidence: number
  source_document_id?: string
  source_document_title?: string
  page_reference?: number
  // injected by D3 simulation
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null
}

export interface GraphEdge {
  id: string
  source: string | GraphNode
  target: string | GraphNode
  relation_type: string
  confidence: number
  group: RelationGroup
}

export interface ArgumentRelation {
  relation_type: string
  confidence: number
  group: 'positive' | 'negative' | 'causal'
  source_document_id: string
  source_document_title: string
  page_reference: number
  full_predicate: string
}

export interface ArgumentDetail {
  argument: GraphNode
  relations: ArgumentRelation[]
  sources: DocNode[]
}

export interface FilterState {
  nodeTypes: Record<GraphNodeType, boolean>
  minConfidence: number
  relationGroups: Record<RelationGroup, boolean>
}
```

- [ ] **Step 4: Create src/utils/geometry.ts**

```typescript
export function isPointInPolygon(
  point: [number, number],
  polygon: [number, number][]
): boolean {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function computeRadialTiers(
  nodes: { id: string; type: string }[],
  edges: { source: string | { id: string }; target: string | { id: string } }[]
): Map<string, number> {
  const getId = (s: string | { id: string }) => (typeof s === 'string' ? s : s.id)
  const degree = new Map<string, number>()
  nodes.filter(n => n.type === 'Argument').forEach(n => degree.set(n.id, 0))
  edges.forEach(e => {
    const sid = getId(e.source); const tid = getId(e.target)
    if (degree.has(sid)) degree.set(sid, (degree.get(sid) ?? 0) + 1)
    if (degree.has(tid)) degree.set(tid, (degree.get(tid) ?? 0) + 1)
  })
  const sorted = [...degree.entries()].sort((a, b) => b[1] - a[1])
  const tierSize = Math.max(1, Math.ceil(sorted.length / 4))
  const tiers = new Map<string, number>()
  sorted.forEach(([id], i) => tiers.set(id, Math.min(3, Math.floor(i / tierSize))))
  return tiers
}

export const RELATION_COLORS: Record<string, string> = {
  positive: '#06d6a0',
  negative: '#ef476f',
  causal: '#ffd166',
  structural: 'rgba(7,59,76,0.2)',
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm run test:run -- tests/geometry.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types src/utils tests/geometry.test.ts
git commit -m "feat: add type definitions and geometry utilities"
```

---

### Task 3: Mock Data Fixtures

**Files:**
- Create: `src/data/mock/documents.json`
- Create: `src/data/mock/graph.json`
- Create: `src/data/mock/detail.json`

- [ ] **Step 1: Create src/data/mock/documents.json**

```json
[
  {"id":"doc_001","title":"Smith et al. 2021 — Chronic exposure pathways","umap_x":1.2,"umap_y":3.4,"pca_x":0.8,"pca_y":1.2,"argument_count":12,"page_count":24,"top_terms":["exposure","chronic","pathways"]},
  {"id":"doc_002","title":"Jones 2020 — Environmental risk factors","umap_x":-0.8,"umap_y":2.9,"pca_x":-0.4,"pca_y":0.9,"argument_count":8,"page_count":18,"top_terms":["risk","environment","factors"]},
  {"id":"doc_003","title":"Chen 2022 — Biomarker analysis","umap_x":2.1,"umap_y":1.8,"pca_x":1.5,"pca_y":0.6,"argument_count":17,"page_count":31,"top_terms":["biomarker","analysis","serum"]},
  {"id":"doc_004","title":"Park 2023 — Population cohort study","umap_x":-1.9,"umap_y":-0.4,"pca_x":-1.2,"pca_y":-0.3,"argument_count":9,"page_count":22,"top_terms":["cohort","population","incidence"]},
  {"id":"doc_005","title":"Williams 2019 — Mechanistic pathways","umap_x":0.3,"umap_y":4.1,"pca_x":0.1,"pca_y":1.8,"argument_count":14,"page_count":28,"top_terms":["mechanism","pathway","signalling"]},
  {"id":"doc_006","title":"Kumar 2021 — Systematic review","umap_x":-2.8,"umap_y":1.2,"pca_x":-2.1,"pca_y":0.5,"argument_count":21,"page_count":35,"top_terms":["systematic","review","meta-analysis"]},
  {"id":"doc_007","title":"Müller 2022 — Dose-response modelling","umap_x":1.8,"umap_y":-1.2,"pca_x":1.1,"pca_y":-0.8,"argument_count":11,"page_count":20,"top_terms":["dose","response","model"]},
  {"id":"doc_008","title":"Tanaka 2020 — Longitudinal outcomes","umap_x":-0.5,"umap_y":-2.3,"pca_x":-0.3,"pca_y":-1.5,"argument_count":7,"page_count":16,"top_terms":["longitudinal","outcome","follow-up"]},
  {"id":"doc_009","title":"Garcia 2023 — Confounding factors","umap_x":3.2,"umap_y":0.7,"pca_x":2.4,"pca_y":0.2,"argument_count":13,"page_count":26,"top_terms":["confounding","adjustment","covariate"]},
  {"id":"doc_010","title":"Brown 2021 — Exposure assessment","umap_x":-1.4,"umap_y":3.8,"pca_x":-0.9,"pca_y":1.6,"argument_count":10,"page_count":21,"top_terms":["assessment","exposure","measurement"]},
  {"id":"doc_011","title":"Lee 2022 — Genetic susceptibility","umap_x":0.6,"umap_y":-3.1,"pca_x":0.4,"pca_y":-2.0,"argument_count":16,"page_count":29,"top_terms":["genetic","susceptibility","polymorphism"]},
  {"id":"doc_012","title":"Anderson 2020 — Urban health disparities","umap_x":-3.4,"umap_y":-1.8,"pca_x":-2.5,"pca_y":-1.1,"argument_count":6,"page_count":14,"top_terms":["urban","health","disparities"]},
  {"id":"doc_013","title":"Patel 2023 — Inflammatory markers","umap_x":2.7,"umap_y":2.5,"pca_x":1.9,"pca_y":1.3,"argument_count":18,"page_count":33,"top_terms":["inflammation","cytokine","marker"]},
  {"id":"doc_014","title":"Okonkwo 2021 — Socioeconomic correlates","umap_x":-2.1,"umap_y":0.2,"pca_x":-1.6,"pca_y":0.1,"argument_count":8,"page_count":19,"top_terms":["socioeconomic","income","deprivation"]},
  {"id":"doc_015","title":"Nguyen 2022 — Oxidative stress","umap_x":1.5,"umap_y":-2.8,"pca_x":0.9,"pca_y":-1.9,"argument_count":15,"page_count":27,"top_terms":["oxidative","stress","ROS"]},
  {"id":"doc_016","title":"Rossi 2020 — Epigenetic regulation","umap_x":-0.2,"umap_y":2.1,"pca_x":-0.1,"pca_y":0.8,"argument_count":12,"page_count":23,"top_terms":["epigenetic","methylation","gene"]},
  {"id":"doc_017","title":"Martínez 2023 — Air quality and cognition","umap_x":3.8,"umap_y":-0.3,"pca_x":2.8,"pca_y":-0.2,"argument_count":9,"page_count":20,"top_terms":["air","quality","cognition"]},
  {"id":"doc_018","title":"Sato 2021 — Dietary risk factors","umap_x":-3.0,"umap_y":2.4,"pca_x":-2.2,"pca_y":1.0,"argument_count":11,"page_count":22,"top_terms":["diet","nutrition","risk"]},
  {"id":"doc_019","title":"Klein 2022 — Cardiovascular endpoints","umap_x":0.9,"umap_y":1.3,"pca_x":0.6,"pca_y":0.5,"argument_count":14,"page_count":25,"top_terms":["cardiovascular","endpoint","event"]},
  {"id":"doc_020","title":"Adeyemi 2023 — Children's health outcomes","umap_x":-1.7,"umap_y":-3.5,"pca_x":-1.2,"pca_y":-2.2,"argument_count":10,"page_count":21,"top_terms":["children","health","outcome"]}
]
```

- [ ] **Step 2: Create src/data/mock/graph.json**

```json
{
  "nodes": [
    {"id":"arg_001","type":"Argument","label":"arg_001","full_text":"Chronic exposure to particulate matter is associated with increased incidence of cardiovascular events.","confidence":0.92,"source_document_id":"doc_001","source_document_title":"Smith et al. 2021 — Chronic exposure pathways","page_reference":14},
    {"id":"arg_002","type":"Argument","label":"arg_002","full_text":"Elevated PM2.5 levels correlate with inflammatory biomarker upregulation.","confidence":0.88,"source_document_id":"doc_003","source_document_title":"Chen 2022 — Biomarker analysis","page_reference":8},
    {"id":"arg_003","type":"Argument","label":"arg_003","full_text":"Oxidative stress mediates the link between air pollution and endothelial dysfunction.","confidence":0.85,"source_document_id":"doc_015","source_document_title":"Nguyen 2022 — Oxidative stress","page_reference":5},
    {"id":"arg_004","type":"Argument","label":"arg_004","full_text":"Socioeconomic deprivation amplifies pollution-related cardiovascular risk.","confidence":0.79,"source_document_id":"doc_014","source_document_title":"Okonkwo 2021 — Socioeconomic correlates","page_reference":11},
    {"id":"arg_005","type":"Argument","label":"arg_005","full_text":"No significant effect of PM2.5 on cardiac events was found in the adjusted cohort.","confidence":0.74,"source_document_id":"doc_004","source_document_title":"Park 2023 — Population cohort study","page_reference":19},
    {"id":"arg_006","type":"Argument","label":"arg_006","full_text":"Low-income populations have higher pollutant exposure and reduced healthcare access.","confidence":0.81,"source_document_id":"doc_012","source_document_title":"Anderson 2020 — Urban health disparities","page_reference":7},
    {"id":"ent_001","type":"Entity","label":"PM2.5","confidence":0.95},
    {"id":"ent_002","type":"Entity","label":"cardiovascular events","confidence":0.91},
    {"id":"ent_003","type":"Entity","label":"inflammatory biomarkers","confidence":0.87},
    {"id":"ent_004","type":"Entity","label":"endothelial dysfunction","confidence":0.82},
    {"id":"ent_005","type":"Entity","label":"oxidative stress","confidence":0.89},
    {"id":"ent_006","type":"Entity","label":"socioeconomic deprivation","confidence":0.76},
    {"id":"ent_007","type":"Entity","label":"cardiovascular risk","confidence":0.83},
    {"id":"ent_008","type":"Entity","label":"cardiac events","confidence":0.71},
    {"id":"con_001","type":"Concept","label":"exposure-response relationship","confidence":0.85},
    {"id":"con_002","type":"Concept","label":"inflammatory pathway","confidence":0.88},
    {"id":"con_003","type":"Concept","label":"health equity","confidence":0.79},
    {"id":"con_004","type":"Concept","label":"particulate matter toxicity","confidence":0.91}
  ],
  "edges": [
    {"id":"e_001","source":"arg_001","target":"arg_002","relation_type":"CORRELATES_WITH","confidence":0.87,"group":"positive"},
    {"id":"e_002","source":"arg_001","target":"arg_003","relation_type":"CAUSES","confidence":0.79,"group":"causal"},
    {"id":"e_003","source":"arg_002","target":"arg_003","relation_type":"SUPPORTS","confidence":0.83,"group":"positive"},
    {"id":"e_004","source":"arg_003","target":"arg_004","relation_type":"REVEALS","confidence":0.72,"group":"positive"},
    {"id":"e_005","source":"arg_001","target":"arg_004","relation_type":"ASSOCIATED_WITH","confidence":0.68,"group":"causal"},
    {"id":"e_006","source":"arg_001","target":"arg_005","relation_type":"CONTRADICTS","confidence":0.81,"group":"negative"},
    {"id":"e_007","source":"arg_004","target":"arg_006","relation_type":"SUPPORTS","confidence":0.91,"group":"positive"},
    {"id":"e_008","source":"arg_001","target":"ent_001","relation_type":"HAS_SUBJECT","confidence":1,"group":"structural"},
    {"id":"e_009","source":"arg_001","target":"ent_002","relation_type":"HAS_OBJECT","confidence":1,"group":"structural"},
    {"id":"e_010","source":"arg_001","target":"con_004","relation_type":"HAS_CONCEPT","confidence":1,"group":"structural"},
    {"id":"e_011","source":"arg_002","target":"ent_001","relation_type":"HAS_SUBJECT","confidence":1,"group":"structural"},
    {"id":"e_012","source":"arg_002","target":"ent_003","relation_type":"HAS_OBJECT","confidence":1,"group":"structural"},
    {"id":"e_013","source":"arg_002","target":"con_002","relation_type":"HAS_CONCEPT","confidence":1,"group":"structural"},
    {"id":"e_014","source":"arg_003","target":"ent_005","relation_type":"HAS_SUBJECT","confidence":1,"group":"structural"},
    {"id":"e_015","source":"arg_003","target":"ent_004","relation_type":"HAS_OBJECT","confidence":1,"group":"structural"},
    {"id":"e_016","source":"arg_003","target":"con_002","relation_type":"HAS_CONCEPT","confidence":1,"group":"structural"},
    {"id":"e_017","source":"arg_004","target":"ent_006","relation_type":"HAS_SUBJECT","confidence":1,"group":"structural"},
    {"id":"e_018","source":"arg_004","target":"ent_007","relation_type":"HAS_OBJECT","confidence":1,"group":"structural"},
    {"id":"e_019","source":"arg_004","target":"con_003","relation_type":"HAS_CONCEPT","confidence":1,"group":"structural"},
    {"id":"e_020","source":"arg_005","target":"ent_008","relation_type":"HAS_OBJECT","confidence":1,"group":"structural"},
    {"id":"e_021","source":"arg_006","target":"ent_006","relation_type":"HAS_SUBJECT","confidence":1,"group":"structural"},
    {"id":"e_022","source":"arg_006","target":"con_003","relation_type":"HAS_CONCEPT","confidence":1,"group":"structural"}
  ]
}
```

- [ ] **Step 3: Create src/data/mock/detail.json**

```json
{
  "argument": {
    "id": "arg_001",
    "type": "Argument",
    "label": "arg_001",
    "full_text": "Chronic exposure to particulate matter is associated with increased incidence of cardiovascular events.",
    "confidence": 0.92,
    "source_document_id": "doc_001",
    "source_document_title": "Smith et al. 2021 — Chronic exposure pathways",
    "page_reference": 14
  },
  "relations": [
    {"relation_type":"CORRELATES_WITH","confidence":0.87,"group":"positive","source_document_id":"doc_003","source_document_title":"Chen 2022 — Biomarker analysis","page_reference":8,"full_predicate":"Elevated PM2.5 levels correlate with inflammatory biomarker upregulation."},
    {"relation_type":"CAUSES","confidence":0.79,"group":"causal","source_document_id":"doc_015","source_document_title":"Nguyen 2022 — Oxidative stress","page_reference":5,"full_predicate":"Oxidative stress mediates the link between air pollution and endothelial dysfunction."},
    {"relation_type":"CONTRADICTS","confidence":0.81,"group":"negative","source_document_id":"doc_004","source_document_title":"Park 2023 — Population cohort study","page_reference":19,"full_predicate":"No significant effect of PM2.5 on cardiac events was found in the adjusted cohort."},
    {"relation_type":"SUPPORTS","confidence":0.83,"group":"positive","source_document_id":"doc_013","source_document_title":"Patel 2023 — Inflammatory markers","page_reference":22,"full_predicate":"Systemic inflammation precedes and predicts cardiovascular events in pollutant-exposed populations."},
    {"relation_type":"ASSOCIATED_WITH","confidence":0.68,"group":"causal","source_document_id":"doc_014","source_document_title":"Okonkwo 2021 — Socioeconomic correlates","page_reference":11,"full_predicate":"Socioeconomic deprivation amplifies pollution-related cardiovascular risk."},
    {"relation_type":"REVEALS","confidence":0.72,"group":"positive","source_document_id":"doc_009","source_document_title":"Garcia 2023 — Confounding factors","page_reference":15,"full_predicate":"Adjustment for confounders reveals a dose-dependent exposure-response relationship."},
    {"relation_type":"INHIBITS","confidence":0.64,"group":"negative","source_document_id":"doc_016","source_document_title":"Rossi 2020 — Epigenetic regulation","page_reference":9,"full_predicate":"Epigenetic silencing of antioxidant genes inhibits the cellular response to PM exposure."},
    {"relation_type":"INCREASES","confidence":0.76,"group":"positive","source_document_id":"doc_007","source_document_title":"Müller 2022 — Dose-response modelling","page_reference":13,"full_predicate":"Dose-response modelling shows increased cardiovascular risk at all PM2.5 levels above background."}
  ],
  "sources": [
    {"id":"doc_001","title":"Smith et al. 2021 — Chronic exposure pathways","umap_x":1.2,"umap_y":3.4,"pca_x":0.8,"pca_y":1.2,"argument_count":12,"page_count":24,"top_terms":["exposure","chronic","pathways"]},
    {"id":"doc_003","title":"Chen 2022 — Biomarker analysis","umap_x":2.1,"umap_y":1.8,"pca_x":1.5,"pca_y":0.6,"argument_count":17,"page_count":31,"top_terms":["biomarker","analysis","serum"]},
    {"id":"doc_004","title":"Park 2023 — Population cohort study","umap_x":-1.9,"umap_y":-0.4,"pca_x":-1.2,"pca_y":-0.3,"argument_count":9,"page_count":22,"top_terms":["cohort","population","incidence"]},
    {"id":"doc_007","title":"Müller 2022 — Dose-response modelling","umap_x":1.8,"umap_y":-1.2,"pca_x":1.1,"pca_y":-0.8,"argument_count":11,"page_count":20,"top_terms":["dose","response","model"]},
    {"id":"doc_009","title":"Garcia 2023 — Confounding factors","umap_x":3.2,"umap_y":0.7,"pca_x":2.4,"pca_y":0.2,"argument_count":13,"page_count":26,"top_terms":["confounding","adjustment","covariate"]},
    {"id":"doc_013","title":"Patel 2023 — Inflammatory markers","umap_x":2.7,"umap_y":2.5,"pca_x":1.9,"pca_y":1.3,"argument_count":18,"page_count":33,"top_terms":["inflammation","cytokine","marker"]},
    {"id":"doc_014","title":"Okonkwo 2021 — Socioeconomic correlates","umap_x":-2.1,"umap_y":0.2,"pca_x":-1.6,"pca_y":0.1,"argument_count":8,"page_count":19,"top_terms":["socioeconomic","income","deprivation"]},
    {"id":"doc_015","title":"Nguyen 2022 — Oxidative stress","umap_x":1.5,"umap_y":-2.8,"pca_x":0.9,"pca_y":-1.9,"argument_count":15,"page_count":27,"top_terms":["oxidative","stress","ROS"]},
    {"id":"doc_016","title":"Rossi 2020 — Epigenetic regulation","umap_x":-0.2,"umap_y":2.1,"pca_x":-0.1,"pca_y":0.8,"argument_count":12,"page_count":23,"top_terms":["epigenetic","methylation","gene"]}
  ]
}
```

- [ ] **Step 4: Commit**

```bash
git add src/data/mock
git commit -m "feat: add mock data fixtures for documents, graph, and argument detail"
```

---

### Task 4: DataService + Tests

**Files:**
- Create: `src/data/DataService.ts`
- Create: `tests/DataService.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/DataService.test.ts
import { describe, it, expect } from 'vitest'
import { MockDataService } from '../src/data/DataService'

const svc = new MockDataService()

describe('MockDataService', () => {
  it('getDocuments returns non-empty array with required fields', async () => {
    const docs = await svc.getDocuments()
    expect(docs.length).toBeGreaterThan(0)
    expect(docs[0]).toHaveProperty('id')
    expect(docs[0]).toHaveProperty('umap_x')
    expect(docs[0]).toHaveProperty('top_terms')
  })

  it('getGraph returns nodes and edges', async () => {
    const { nodes, edges } = await svc.getGraph(['doc_001'])
    expect(nodes.length).toBeGreaterThan(0)
    expect(edges.length).toBeGreaterThan(0)
    expect(nodes[0]).toHaveProperty('type')
    expect(edges[0]).toHaveProperty('group')
  })

  it('getArgumentDetail returns argument with relations array', async () => {
    const detail = await svc.getArgumentDetail('arg_001')
    expect(detail.argument).toHaveProperty('id')
    expect(Array.isArray(detail.relations)).toBe(true)
    expect(detail.relations[0]).toHaveProperty('full_predicate')
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
npm run test:run -- tests/DataService.test.ts
```
Expected: FAIL — "Cannot find module '../src/data/DataService'"

- [ ] **Step 3: Create src/data/DataService.ts**

```typescript
import type { DocNode, GraphNode, GraphEdge, ArgumentDetail } from '../types'
import documentsJson from './mock/documents.json'
import graphJson from './mock/graph.json'
import detailJson from './mock/detail.json'

export interface DataServiceInterface {
  getDocuments(): Promise<DocNode[]>
  getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
  getArgumentDetail(argumentId: string): Promise<ArgumentDetail>
}

export class MockDataService implements DataServiceInterface {
  async getDocuments(): Promise<DocNode[]> {
    return documentsJson as DocNode[]
  }
  async getGraph(_ids: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    return graphJson as { nodes: GraphNode[]; edges: GraphEdge[] }
  }
  async getArgumentDetail(_id: string): Promise<ArgumentDetail> {
    return detailJson as unknown as ArgumentDetail
  }
}

export const dataService: DataServiceInterface = new MockDataService()
```

- [ ] **Step 4: Add resolveJsonModule to tsconfig.json**

In `tsconfig.json` under `compilerOptions`, ensure:
```json
"resolveJsonModule": true
```

- [ ] **Step 5: Run tests — verify pass**

```bash
npm run test:run -- tests/DataService.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/data/DataService.ts tests/DataService.test.ts tsconfig.json
git commit -m "feat: add DataService interface and mock implementation"
```

---

### Task 5: Zustand Store + Tests

**Files:**
- Create: `src/store/useStore.ts`
- Create: `tests/store.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../src/store/useStore'

beforeEach(() => {
  useStore.setState({
    selectedDocumentIds: [],
    selectedNodeId: null,
    activeView: 'corpus',
  })
})

describe('useStore', () => {
  it('toggleDocumentSelection adds a new id', () => {
    useStore.getState().toggleDocumentSelection('doc_001')
    expect(useStore.getState().selectedDocumentIds).toContain('doc_001')
  })
  it('toggleDocumentSelection removes an existing id', () => {
    useStore.setState({ selectedDocumentIds: ['doc_001'] })
    useStore.getState().toggleDocumentSelection('doc_001')
    expect(useStore.getState().selectedDocumentIds).not.toContain('doc_001')
  })
  it('clearSelection empties the array', () => {
    useStore.setState({ selectedDocumentIds: ['doc_001', 'doc_002'] })
    useStore.getState().clearSelection()
    expect(useStore.getState().selectedDocumentIds).toHaveLength(0)
  })
  it('setSelectedNode updates selectedNodeId', () => {
    useStore.getState().setSelectedNode('arg_001')
    expect(useStore.getState().selectedNodeId).toBe('arg_001')
  })
  it('setActiveView changes active view', () => {
    useStore.getState().setActiveView('graph')
    expect(useStore.getState().activeView).toBe('graph')
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
npm run test:run -- tests/store.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Create src/store/useStore.ts**

```typescript
import { create } from 'zustand'
import type { FilterState, ActiveView, Projection, SizeBy } from '../types'

const defaultFilters: FilterState = {
  nodeTypes: { Argument: true, Entity: true, Concept: true },
  minConfidence: 0,
  relationGroups: { positive: true, negative: true, causal: true, structural: true },
}

interface AppState {
  selectedDocumentIds: string[]
  selectedNodeId: string | null
  activeView: ActiveView
  filters: FilterState
  projection: Projection
  sizeBy: SizeBy
  toggleDocumentSelection: (id: string) => void
  setSelectedDocuments: (ids: string[]) => void
  clearSelection: () => void
  selectAll: (ids: string[]) => void
  setSelectedNode: (id: string | null) => void
  setActiveView: (view: ActiveView) => void
  setFilters: (partial: Partial<FilterState>) => void
  setProjection: (p: Projection) => void
  setSizeBy: (s: SizeBy) => void
}

export const useStore = create<AppState>((set) => ({
  selectedDocumentIds: [],
  selectedNodeId: null,
  activeView: 'corpus',
  filters: defaultFilters,
  projection: 'umap',
  sizeBy: 'argument_count',
  toggleDocumentSelection: (id) =>
    set((s) => ({
      selectedDocumentIds: s.selectedDocumentIds.includes(id)
        ? s.selectedDocumentIds.filter((d) => d !== id)
        : [...s.selectedDocumentIds, id],
    })),
  setSelectedDocuments: (ids) => set({ selectedDocumentIds: ids }),
  clearSelection: () => set({ selectedDocumentIds: [] }),
  selectAll: (ids) => set({ selectedDocumentIds: ids }),
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  setActiveView: (view) => set({ activeView: view }),
  setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
  setProjection: (p) => set({ projection: p }),
  setSizeBy: (s) => set({ sizeBy: s }),
}))
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm run test:run -- tests/store.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Confirm all tests pass together**

```bash
npm run test:run
```
Expected: 14 tests pass (geometry + DataService + store).

- [ ] **Step 6: Commit**

```bash
git add src/store tests/store.test.ts
git commit -m "feat: add Zustand store with selection and filter state"
```

---

### Task 6: Global Styles + FloatingCard + StatusBar

**Files:**
- Create: `src/styles/global.css`
- Create: `src/components/FloatingCard/FloatingCard.tsx`
- Create: `src/components/FloatingCard/FloatingCard.module.css`
- Create: `src/components/StatusBar/StatusBar.tsx`
- Create: `src/components/StatusBar/StatusBar.module.css`

- [ ] **Step 1: Create src/styles/global.css**

```css
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 12px;
  background: #e8edf2;
  color: #374151;
  -webkit-font-smoothing: antialiased;
}

.card {
  border-radius: 12px;
  background: #ffffff;
  box-shadow:
    0 0 0 1px  rgba(17, 138, 178, 0.28),
    0 0 4px 0px rgba(17, 138, 178, 0.18),
    0 2px 6px   rgba(7, 59, 76, 0.07),
    0 10px 28px rgba(7, 59, 76, 0.09);
}

.card-mid {
  border-radius: 12px;
  background: #f4f7fa;
  box-shadow:
    0 0 0 1px  rgba(17, 138, 178, 0.22),
    0 0 4px 0px rgba(17, 138, 178, 0.13),
    0 2px 6px   rgba(7, 59, 76, 0.06),
    0 10px 28px rgba(7, 59, 76, 0.08);
}

.sl {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #073b4c;
  opacity: 0.55;
  margin-bottom: 6px;
}
```

- [ ] **Step 2: Create FloatingCard**

```tsx
// src/components/FloatingCard/FloatingCard.tsx
import type { CSSProperties, ReactNode } from 'react'
import styles from './FloatingCard.module.css'

interface Props {
  style?: CSSProperties
  className?: string
  children: ReactNode
  onDismiss?: () => void
}

export function FloatingCard({ style, className, children, onDismiss }: Props) {
  return (
    <div className={`card ${styles.card} ${className ?? ''}`} style={style}>
      {onDismiss && (
        <button className={styles.dismiss} onClick={onDismiss}>×</button>
      )}
      {children}
    </div>
  )
}
```

```css
/* src/components/FloatingCard/FloatingCard.module.css */
.card {
  position: absolute;
  padding: 14px 16px;
  max-width: 260px;
  z-index: 200;
}
.dismiss {
  position: absolute;
  top: 8px; right: 10px;
  background: none; border: none;
  color: #9ca3af; font-size: 18px;
  cursor: pointer; line-height: 1; padding: 0;
}
.dismiss:hover { color: #374151; }
```

- [ ] **Step 3: Create StatusBar**

```tsx
// src/components/StatusBar/StatusBar.tsx
import { useStore } from '../../store/useStore'
import styles from './StatusBar.module.css'

export function StatusBar() {
  const { selectedDocumentIds, filters, projection } = useStore()
  return (
    <div className={styles.bar}>
      <span className={styles.chip}>
        {selectedDocumentIds.length} doc{selectedDocumentIds.length !== 1 ? 's' : ''} selected
      </span>
      <span className={styles.dot}>·</span>
      <span className={styles.chip}>{projection.toUpperCase()}</span>
      <span className={styles.dot}>·</span>
      <span className={styles.chip}>conf ≥ {filters.minConfidence.toFixed(2)}</span>
    </div>
  )
}
```

```css
/* src/components/StatusBar/StatusBar.module.css */
.bar {
  height: 28px;
  background: #073b4c;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
  flex-shrink: 0;
}
.chip { font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 0.04em; }
.dot  { color: rgba(255,255,255,0.3); font-size: 9px; }
```

- [ ] **Step 4: Commit**

```bash
git add src/styles src/components/FloatingCard src/components/StatusBar
git commit -m "feat: add global CSS design system and FloatingCard/StatusBar components"
```

---

### Task 7: Shell

**Files:**
- Create: `src/components/Shell/Shell.tsx`
- Create: `src/components/Shell/Shell.module.css`

- [ ] **Step 1: Create Shell.tsx**

```tsx
// src/components/Shell/Shell.tsx
import type { ReactNode } from 'react'
import { useStore } from '../../store/useStore'
import { StatusBar } from '../StatusBar/StatusBar'
import styles from './Shell.module.css'

const VIEW_ORDER = ['corpus', 'graph', 'detail'] as const

interface Props {
  children: [ReactNode, ReactNode, ReactNode]
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
          {(['corpus', 'graph', 'detail'] as const).map((v) => (
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

- [ ] **Step 2: Create Shell.module.css**

```css
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
.topBar {
  height: 48px; background: #fff; display: flex; align-items: center;
  padding: 0 20px; gap: 24px; flex-shrink: 0; z-index: 100;
  box-shadow: 0 1px 0 rgba(7,59,76,0.10);
}
.logo { font-size: 13px; font-weight: 800; letter-spacing: 0.12em; color: #073b4c; }
.tabs { display: flex; gap: 2px; }
.tab {
  background: none; border: none; border-bottom: 2px solid transparent;
  padding: 4px 14px; font-size: 12px; font-weight: 600; color: #6b7280;
  cursor: pointer; display: flex; align-items: center; gap: 6px;
}
.tab.active  { color: #073b4c; border-bottom-color: #073b4c; }
.tab.dimmed  { opacity: 0.4; cursor: not-allowed; }
.badge {
  background: #F4A124; color: #073b4c; border-radius: 10px;
  padding: 1px 6px; font-size: 9px; font-weight: 700;
}
.cta {
  margin-left: auto; background: #073b4c; color: #fff;
  border: none; border-radius: 8px; padding: 6px 16px;
  font-size: 11px; font-weight: 700; cursor: pointer;
}
.cta:hover { background: #0a4d63; }
.viewArea  { flex: 1; overflow: hidden; position: relative; }
.viewTrack {
  display: flex; height: 100%;
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.viewPanel { flex: 0 0 100%; width: 100%; height: 100%; overflow: hidden; }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Shell
git commit -m "feat: add Shell with tab navigation, CTA, and slide animation"
```

---

### Task 8: FilterRail + App Wiring (first render)

**Files:**
- Create: `src/components/FilterRail/FilterRail.tsx`
- Create: `src/components/FilterRail/FilterRail.module.css`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create FilterRail.tsx**

```tsx
// src/components/FilterRail/FilterRail.tsx
import { useState, type ReactNode } from 'react'
import styles from './FilterRail.module.css'

export interface RailSection {
  id: string
  icon: ReactNode
  label: string
  content: ReactNode
}

export function FilterRail({ sections }: { sections: RailSection[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id))
  const open = sections.find((s) => s.id === openId)

  return (
    <div className={styles.rail}>
      <div className={styles.strip}>
        {sections.map((s) => (
          <button
            key={s.id}
            className={`${styles.iconBtn} ${openId === s.id ? styles.active : ''}`}
            onClick={() => toggle(s.id)}
            title={s.label}
          >
            {s.icon}
          </button>
        ))}
      </div>
      {open && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{open.label}</div>
          <div className={styles.panelContent}>{open.content}</div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create FilterRail.module.css**

```css
.rail  { display: flex; height: 100%; flex-shrink: 0; }
.strip {
  width: 44px; background: #fff; border-right: 1px solid rgba(7,59,76,0.08);
  display: flex; flex-direction: column; padding: 8px 0; gap: 2px;
}
.iconBtn {
  width: 44px; height: 44px; background: none; border: none;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: #6b7280;
}
.iconBtn:hover { background: #f4f7fa; color: #073b4c; }
.iconBtn.active { background: #f4f7fa; color: #073b4c; border-right: 2px solid #073b4c; }
.panel {
  width: 160px; background: #fff; border-right: 1px solid rgba(7,59,76,0.08);
  overflow-y: auto; padding: 12px;
}
.panelTitle {
  font-size: 9px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #073b4c; opacity: 0.55; margin-bottom: 10px;
}
.panelContent { display: flex; flex-direction: column; gap: 12px; }
```

- [ ] **Step 3: Replace src/App.tsx**

```tsx
import { Shell } from './components/Shell/Shell'
import styles from './App.module.css'

function StubView({ label }: { label: string }) {
  return <div className={styles.stub}>{label}</div>
}

export function App() {
  return (
    <Shell>
      <StubView label="Corpus View" />
      <StubView label="Graph View" />
      <StubView label="Detail View" />
    </Shell>
  )
}
```

- [ ] **Step 4: Create src/App.module.css**

```css
.stub {
  display: flex; align-items: center; justify-content: center;
  height: 100%; font-size: 18px; font-weight: 600; color: #073b4c; opacity: 0.4;
  background: #fafbfc;
}
```

- [ ] **Step 5: Replace src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 6: Verify in browser**

```bash
npm run dev
```
Open http://localhost:5173. Expected: Navy top bar with "GRAPHVISOR", three tabs (Corpus active), "Corpus View" stub centred, navy status bar at bottom. Click Graph/Detail tabs — slide animation moves to next stub. Detail tab should be disabled/greyed.

- [ ] **Step 7: Commit**

```bash
git add src/components/FilterRail src/App.tsx src/App.module.css src/main.tsx
git commit -m "feat: add FilterRail, wire Shell with stub views — app shell complete"
```

---

### Task 9: Corpus View — Scatter + Zoom/Pan

**Files:**
- Create: `src/views/CorpusView/CorpusView.tsx`
- Create: `src/views/CorpusView/CorpusView.module.css`
- Create: `src/views/CorpusView/useCorpusD3.ts`

- [ ] **Step 1: Create useCorpusD3.ts**

```typescript
// src/views/CorpusView/useCorpusD3.ts
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

export function useCorpusD3(
  svgRef: RefObject<SVGSVGElement | null>,
  docs: DocNode[],
  opts: Options
) {
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>()
  const simPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  // Keep opts accessible inside D3 callbacks without stale closure
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!svgRef.current || docs.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.style('background', CANVAS_BG)

    // Scales
    const getX = (d: DocNode) => opts.projection === 'umap' ? d.umap_x : d.pca_x
    const getY = (d: DocNode) => opts.projection === 'umap' ? d.umap_y : d.pca_y
    const pad = 60
    const xScale = d3.scaleLinear()
      .domain(d3.extent(docs, getX) as [number, number]).range([pad, width - pad])
    const yScale = d3.scaleLinear()
      .domain(d3.extent(docs, getY) as [number, number]).range([height - pad, pad])

    const getRadius = (d: DocNode) => {
      if (opts.sizeBy === 'uniform') return 6
      const vals = docs.map(dd => opts.sizeBy === 'argument_count' ? dd.argument_count : dd.page_count)
      const ext = d3.extent(vals) as [number, number]
      const val = opts.sizeBy === 'argument_count' ? d.argument_count : d.page_count
      return d3.scaleLinear().domain(ext).range([4, 9])(val)
    }

    // Brief forceCollide to separate overlapping dots
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

    // Zoom group
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event) => zoomG.attr('transform', event.transform))
    svg.call(zoom)
    zoomRef.current = zoom

    // Dots
    const dotLayer = zoomG.append('g').attr('class', 'dots')
    dotLayer.selectAll<SVGCircleElement, DocNode>('circle')
      .data(docs, d => d.id)
      .join('circle')
      .attr('class', 'corpus-dot')
      .attr('cx', d => simPositions.current.get(d.id)?.x ?? xScale(getX(d)))
      .attr('cy', d => simPositions.current.get(d.id)?.y ?? yScale(getY(d)))
      .attr('r', d => getRadius(d))
      .attr('fill', d => optsRef.current.selectedIds.has(d.id) ? '#F4A124' : '#ef476f')
      .attr('stroke', d => optsRef.current.selectedIds.has(d.id) ? '#F4A124' : 'none')
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
  }, [docs, opts.projection, opts.sizeBy])

  // Update dot colors when selection changes
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGCircleElement, DocNode>('.corpus-dot')
      .attr('fill', d => opts.selectedIds.has(d.id) ? '#F4A124' : '#ef476f')
      .attr('stroke', d => opts.selectedIds.has(d.id) ? '#F4A124' : 'none')
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
```

- [ ] **Step 2: Create CorpusView.tsx**

```tsx
// src/views/CorpusView/CorpusView.tsx
import { useRef, useState, useEffect, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import { useCorpusD3 } from './useCorpusD3'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

export function CorpusView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [docs, setDocs] = useState<DocNode[]>([])
  const [tooltip, setTooltip] = useState<{ doc: DocNode; x: number; y: number } | null>(null)
  const {
    selectedDocumentIds, setSelectedDocuments, toggleDocumentSelection,
    clearSelection, selectAll, projection, setSizeBy, setProjection, sizeBy,
  } = useStore()

  const selectedIds = useMemo(() => new Set(selectedDocumentIds), [selectedDocumentIds])

  useEffect(() => { dataService.getDocuments().then(setDocs) }, [])

  const { zoomToFit, resetZoom } = useCorpusD3(svgRef, docs, {
    selectedIds,
    projection,
    sizeBy,
    onLassoSelect: (ids) =>
      setSelectedDocuments([...new Set([...selectedDocumentIds, ...ids])]),
    onClickToggle: (id, shiftKey) => {
      if (shiftKey) toggleDocumentSelection(id)
      else setSelectedDocuments(selectedDocumentIds.includes(id) ? [] : [id])
    },
    setTooltip,
  })

  const railSections = [
    {
      id: 'selection', icon: '◻', label: 'Selection',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#073b4c' }}>
            {selectedDocumentIds.length} selected
          </div>
          <button onClick={clearSelection} style={btnStyle}>Clear</button>
          <button onClick={() => selectAll(docs.map(d => d.id))} style={btnStyle}>All</button>
        </div>
      ),
    },
    {
      id: 'projection', icon: '⊕', label: 'Projection',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['umap', 'pca'] as const).map(p => (
            <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="radio" name="proj" checked={projection === p} onChange={() => setProjection(p)} style={{ accentColor: '#073b4c' }} />
              {p.toUpperCase()}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'size', icon: '◉', label: 'Size nodes by',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([['argument_count', 'Arg count'], ['uniform', 'Uniform'], ['page_count', 'Page count']] as const).map(([val, lbl]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="radio" name="size" checked={sizeBy === val} onChange={() => setSizeBy(val)} style={{ accentColor: '#073b4c' }} />
              {lbl}
            </label>
          ))}
        </div>
      ),
    },
  ]

  return (
    <div className={styles.view}>
      <FilterRail sections={railSections} />
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />
        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={zoomToFit}>Fit</button>
          <button className={styles.toolBtn} onClick={resetZoom}>Reset</button>
        </div>
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
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
```

- [ ] **Step 3: Create CorpusView.module.css**

```css
.view   { display: flex; height: 100%; overflow: hidden; }
.canvas { flex: 1; position: relative; background: #fafbfc; }
.svg    { width: 100%; height: 100%; display: block; }
.toolbar {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 4px; background: #fff; border-radius: 8px; padding: 4px;
  box-shadow: 0 0 0 1px rgba(17,138,178,0.22), 0 2px 6px rgba(7,59,76,0.08);
}
.toolBtn {
  background: none; border: none; padding: 4px 10px; font-size: 10px;
  font-weight: 600; color: #073b4c; cursor: pointer; border-radius: 5px;
}
.toolBtn:hover { background: #f4f7fa; }
```

- [ ] **Step 4: Update App.tsx to use CorpusView**

```tsx
import { Shell } from './components/Shell/Shell'
import { CorpusView } from './views/CorpusView/CorpusView'
import styles from './App.module.css'

function StubView({ label }: { label: string }) {
  return <div className={styles.stub}>{label}</div>
}

export function App() {
  return (
    <Shell>
      <CorpusView />
      <StubView label="Graph View" />
      <StubView label="Detail View" />
    </Shell>
  )
}
```

- [ ] **Step 5: Verify in browser**

Open http://localhost:5173. Expected:
- 20 red dots scattered across the canvas, sized by argument count.
- Click a dot → turns amber.
- Drag on canvas background → amber dashed lasso path. Release → touched dots turn amber, count in status bar updates.
- Filter rail: click selection icon → panel opens showing count + Clear/All buttons. Clear removes selection.
- "View Graph →" button appears in top bar when docs are selected.
- Fit/Reset toolbar buttons work.

- [ ] **Step 6: Commit**

```bash
git add src/views/CorpusView
git commit -m "feat: implement Corpus View with D3 scatter, lasso, zoom, and filter rail"
```

---

### Task 10: Graph View — Force Simulation + Rendering

**Files:**
- Create: `src/views/GraphView/useGraphD3.ts`
- Create: `src/views/GraphView/GraphView.tsx`
- Create: `src/views/GraphView/GraphView.module.css`
- Create: `src/views/GraphView/NodeDetailCard.tsx`
- Create: `src/views/GraphView/GraphFilterRail.tsx`

- [ ] **Step 1: Create useGraphD3.ts**

```typescript
// src/views/GraphView/useGraphD3.ts
import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RefObject } from 'react'
import type { GraphNode, GraphEdge, FilterState } from '../../types'
import { computeRadialTiers, RELATION_COLORS } from '../../utils/geometry'

const RADIAL_RADII = [0, 120, 240, 360]

interface Options {
  filters: FilterState
  selectedNodeId: string | null
  onNodeClick: (node: GraphNode) => void
}

export function useGraphD3(
  svgRef: RefObject<SVGSVGElement | null>,
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: Options
) {
  const simRef = useRef<d3.Simulation<GraphNode, GraphEdge>>()
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return
    const svgEl = svgRef.current
    const { width, height } = svgEl.getBoundingClientRect()
    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()
    svg.style('background', '#fafbfc')

    // Zoom
    const zoomG = svg.append('g').attr('class', 'zoom-group')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on('zoom', (e) => zoomG.attr('transform', e.transform))
    svg.call(zoom)

    // Concentric rings (inside zoom group, so they move with pan/zoom)
    const ringG = zoomG.append('g').attr('class', 'rings')
    for (let i = 1; i <= 7; i++) {
      ringG.append('circle')
        .attr('cx', width / 2).attr('cy', height / 2)
        .attr('r', i * 120)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(7,59,76,0.05)')
        .attr('stroke-width', 1)
    }

    // Filter edges by confidence + relation groups
    const { minConfidence, relationGroups, nodeTypes } = optsRef.current.filters
    const filteredEdges = edges.filter(
      e => e.confidence >= minConfidence && relationGroups[e.group]
    )
    const visibleNodeIds = new Set<string>()
    filteredEdges.forEach(e => {
      visibleNodeIds.add(typeof e.source === 'string' ? e.source : e.source.id)
      visibleNodeIds.add(typeof e.target === 'string' ? e.target : e.target.id)
    })
    nodes.filter(n => nodeTypes[n.type]).forEach(n => visibleNodeIds.add(n.id))

    const visibleNodes = nodes.filter(n => nodeTypes[n.type])
    const tiers = computeRadialTiers(visibleNodes, filteredEdges)

    // Deep clone for simulation (D3 mutates positions)
    const simNodes: GraphNode[] = visibleNodes.map(n => ({ ...n }))
    const simEdges: GraphEdge[] = filteredEdges.map(e => ({ ...e }))

    // Count edges per argument for sizing
    const degree = new Map<string, number>()
    simNodes.forEach(n => degree.set(n.id, 0))
    filteredEdges.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : e.source.id
      const tid = typeof e.target === 'string' ? e.target : e.target.id
      degree.set(sid, (degree.get(sid) ?? 0) + 1)
      degree.set(tid, (degree.get(tid) ?? 0) + 1)
    })

    // Layers
    const edgeG = zoomG.append('g').attr('class', 'edges')
    const nodeG = zoomG.append('g').attr('class', 'nodes')

    // Edge labels on hover (title tooltip)
    const edgeSel = edgeG.selectAll<SVGLineElement, GraphEdge>('line')
      .data(simEdges, d => d.id)
      .join('line')
      .attr('stroke', d => RELATION_COLORS[d.group])
      .attr('stroke-width', d => d.group === 'structural' ? 1 : Math.max(1, d.confidence * 3))
      .attr('stroke-dasharray', d =>
        d.relation_type === 'CONTRADICTS' || d.relation_type === 'INHIBITS' ? '5 4' : null)
      .attr('opacity', d => d.group === 'structural' ? 0.25 : 0.8)

    edgeSel
      .append('title')
      .text(d => `${d.relation_type} · ${d.confidence.toFixed(2)}`)

    // Node groups
    const nodeGroups = nodeG.selectAll<SVGGElement, GraphNode>('g')
      .data(simNodes, d => d.id)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0)
            // Keep sticky — don't clear fx/fy
          })
      )
      .on('click', (_, d) => optsRef.current.onNodeClick(d))

    // Draw shape per node type
    nodeGroups.each(function(d) {
      const g = d3.select(this)
      const deg = degree.get(d.id) ?? 0
      if (d.type === 'Argument') {
        const size = 16 + Math.min(deg, 10) * 1.5
        g.append('rect')
          .attr('x', -size / 2).attr('y', -size / 2)
          .attr('width', size).attr('height', size)
          .attr('rx', 4).attr('fill', '#073b4c')
        g.append('title').text(d.full_text ?? d.label)
      } else if (d.type === 'Entity') {
        g.append('circle').attr('r', 8).attr('fill', '#118ab2')
        g.append('title').text(d.label)
      } else {
        g.append('polygon').attr('points', '0,-10 10,0 0,10 -10,0').attr('fill', '#74b9d6')
        g.append('title').text(d.label)
      }
    })

    // Simulation
    const sim = d3.forceSimulation<GraphNode>(simNodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges)
        .id(d => d.id)
        .strength(d => d.group === 'structural' ? 0.2 : d.confidence * 0.4))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-180).theta(0.9))
      .force('collide', d3.forceCollide<GraphNode>(d => d.type === 'Argument' ? 22 : 14).strength(0.7))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('radial',
        d3.forceRadial<GraphNode>(
          d => d.type === 'Argument' ? RADIAL_RADII[tiers.get(d.id) ?? 3] : 0,
          width / 2, height / 2
        ).strength(d => d.type === 'Argument' ? 0.4 : 0)
      )

    sim.on('tick', () => {
      edgeSel
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!)

      nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    simRef.current = sim
    return () => { sim.stop() }
  }, [nodes, edges, opts.filters])

  // Update selection halo without re-running simulation
  useEffect(() => {
    if (!svgRef.current) return
    d3.select(svgRef.current).selectAll<SVGGElement, GraphNode>('.nodes g')
      .each(function(d) {
        const g = d3.select(this)
        g.select('.selection-halo').remove()
        if (d.id === optsRef.current.selectedNodeId) {
          g.insert('circle', ':first-child')
            .attr('class', 'selection-halo')
            .attr('r', 18).attr('fill', 'none')
            .attr('stroke', '#F4A124').attr('stroke-width', 2.5)
        }
      })
  }, [opts.selectedNodeId])

  const reheat = () => simRef.current?.alpha(0.5).restart()
  const freeze = () => simRef.current?.stop()

  return { reheat, freeze }
}
```

- [ ] **Step 2: Create NodeDetailCard.tsx**

```tsx
// src/views/GraphView/NodeDetailCard.tsx
import { FloatingCard } from '../../components/FloatingCard/FloatingCard'
import type { GraphNode, GraphEdge } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  node: GraphNode
  edges: GraphEdge[]
  onDismiss: () => void
  onOpenDetail: () => void
}

export function NodeDetailCard({ node, edges, onDismiss, onOpenDetail }: Props) {
  const outgoing = edges
    .filter(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      return sid === node.id && e.group !== 'structural'
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)

  return (
    <FloatingCard style={{ bottom: 16, right: 16, top: 'auto', left: 'auto', maxWidth: 240 }} onDismiss={onDismiss}>
      <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(7,59,76,0.4)', letterSpacing: '0.08em', marginBottom: 3 }}>
        {node.type.toUpperCase()} · {node.confidence.toFixed(2)}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
        {node.source_document_title
          ? `${node.source_document_title.split(' — ')[0]} · p.${node.page_reference}`
          : node.label}
      </div>
      {node.full_text && (
        <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.45, marginBottom: 8 }}>
          "{node.full_text.slice(0, 120)}{node.full_text.length > 120 ? '…' : ''}"
        </div>
      )}
      {outgoing.map(e => {
        const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        const targetNode = typeof e.target === 'object' ? e.target as GraphNode : null
        return (
          <div key={e.id} className="card-mid" style={{ padding: '5px 8px', marginBottom: 4, borderRadius: 7 }}>
            <span style={{ fontSize: 8, fontWeight: 700, color: RELATION_COLORS[e.group] }}>
              {e.relation_type} {e.confidence.toFixed(2)}
            </span>
            {targetNode?.full_text && (
              <div style={{ fontSize: 9, color: '#6b7280', marginTop: 1 }}>
                "{targetNode.full_text.slice(0, 60)}…"
              </div>
            )}
          </div>
        )
      })}
      <button
        onClick={onOpenDetail}
        style={{
          width: '100%', background: '#F4A124', color: '#073b4c',
          border: 'none', borderRadius: 7, padding: '6px 0',
          fontSize: 10, fontWeight: 700, cursor: 'pointer', marginTop: 4,
        }}
      >
        Open full detail →
      </button>
    </FloatingCard>
  )
}
```

- [ ] **Step 3: Create GraphFilterRail.tsx**

```tsx
// src/views/GraphView/GraphFilterRail.tsx
import type { FilterState } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  filters: FilterState
  nodeCount: number
  onFilterChange: (f: Partial<FilterState>) => void
  onReheat: () => void
  onFreeze: () => void
}

export function graphRailSections({ filters, nodeCount, onFilterChange, onReheat, onFreeze }: Props) {
  return [
    {
      id: 'nodes', icon: '◻', label: 'Node types',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['Argument', 'Entity', 'Concept'] as const).map(type => (
            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.nodeTypes[type]}
                onChange={e => onFilterChange({ nodeTypes: { ...filters.nodeTypes, [type]: e.target.checked } })}
                style={{ accentColor: '#073b4c' }}
              />
              {type}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'confidence', icon: '~', label: 'Confidence',
      content: (
        <div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={filters.minConfidence}
            onChange={e => onFilterChange({ minConfidence: Number(e.target.value) })}
            style={{ width: '100%', accentColor: '#F4A124' }}
          />
          <div style={{ fontSize: 10, color: '#F4A124', fontWeight: 700, textAlign: 'right' }}>
            ≥ {filters.minConfidence.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      id: 'relations', icon: '↔', label: 'Relations',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['positive', 'negative', 'causal', 'structural'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.relationGroups[group]}
                onChange={e => onFilterChange({ relationGroups: { ...filters.relationGroups, [group]: e.target.checked } })}
                style={{ accentColor: '#073b4c' }}
              />
              <span style={{ width: 14, height: 2, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 1 }} />
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </label>
          ))}
        </div>
      ),
    },
    {
      id: 'layout', icon: '⟳', label: 'Layout',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onReheat} style={btnS}>Reheat simulation</button>
          <button onClick={onFreeze} style={{ ...btnS, background: '#f4f7fa', color: '#073b4c', border: '1px solid rgba(7,59,76,0.15)' }}>Freeze</button>
        </div>
      ),
    },
  ]
}

const btnS: React.CSSProperties = {
  background: '#073b4c', color: '#fff', border: 'none', borderRadius: 6,
  padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
}
```

- [ ] **Step 4: Create GraphView.tsx**

```tsx
// src/views/GraphView/GraphView.tsx
import { useRef, useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { useGraphD3 } from './useGraphD3'
import { NodeDetailCard } from './NodeDetailCard'
import { graphRailSections } from './GraphFilterRail'
import type { GraphNode, GraphEdge } from '../../types'
import styles from './GraphView.module.css'

export function GraphView() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const { selectedDocumentIds, selectedNodeId, setSelectedNode, setActiveView, filters, setFilters } = useStore()

  useEffect(() => {
    dataService.getGraph(selectedDocumentIds).then(({ nodes, edges }) => {
      setNodes(nodes); setEdges(edges)
    })
  }, [selectedDocumentIds])

  const { reheat, freeze } = useGraphD3(svgRef, nodes, edges, {
    filters,
    selectedNodeId,
    onNodeClick: (node) => setSelectedNode(node.id),
  })

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  return (
    <div className={styles.view}>
      <FilterRail sections={graphRailSections({
        filters, nodeCount: nodes.length,
        onFilterChange: setFilters,
        onReheat: reheat, onFreeze: freeze,
      })} />
      <div className={styles.canvas}>
        <svg ref={svgRef} className={styles.svg} />
        {selectedNode && (
          <NodeDetailCard
            node={selectedNode}
            edges={edges}
            onDismiss={() => setSelectedNode(null)}
            onOpenDetail={() => setActiveView('detail')}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create GraphView.module.css**

```css
.view   { display: flex; height: 100%; overflow: hidden; }
.canvas { flex: 1; position: relative; background: #fafbfc; }
.svg    { width: 100%; height: 100%; display: block; }
```

- [ ] **Step 6: Update App.tsx**

```tsx
import { Shell } from './components/Shell/Shell'
import { CorpusView } from './views/CorpusView/CorpusView'
import { GraphView } from './views/GraphView/GraphView'
import styles from './App.module.css'

function StubView({ label }: { label: string }) {
  return <div className={styles.stub}>{label}</div>
}

export function App() {
  return (
    <Shell>
      <CorpusView />
      <GraphView />
      <StubView label="Detail View" />
    </Shell>
  )
}
```

- [ ] **Step 7: Verify in browser**

Select some docs in Corpus view, click "View Graph →". Expected:
- Force simulation runs; Argument nodes (navy rounded squares) cluster toward centre based on degree centrality, Entities (blue circles) and Concepts (light blue diamonds) float freely.
- Faint concentric grey rings visible behind nodes.
- Drag a node — it stays where dropped.
- Click a node — amber halo ring appears, floating white card in bottom-right shows type, confidence, source, top relations, and "Open full detail →" button.
- Filter rail: confidence slider hides low-confidence edges. Node type checkboxes toggle visibility. Reheat button restarts simulation.

- [ ] **Step 8: Commit**

```bash
git add src/views/GraphView
git commit -m "feat: implement Graph View with force simulation, radial tiers, and node detail card"
```

---

### Task 11: Detail View

**Files:**
- Create: `src/views/DetailView/DetailView.tsx`
- Create: `src/views/DetailView/DetailView.module.css`
- Create: `src/views/DetailView/DetailMiniMap.tsx`
- Create: `src/views/DetailView/RelationList.tsx`
- Create: `src/views/DetailView/DetailFilterRail.tsx`

- [ ] **Step 1: Create DetailMiniMap.tsx**

```tsx
// src/views/DetailView/DetailMiniMap.tsx
import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import type { ArgumentDetail, DocNode } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  allDocs: DocNode[]
}

export function DetailMiniMap({ detail, allDocs }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || allDocs.length === 0) return
    const el = svgRef.current
    const { width, height } = el.getBoundingClientRect()
    const svg = d3.select(el)
    svg.selectAll('*').remove()

    const pad = 12
    const xExt = d3.extent(allDocs, d => d.umap_x) as [number, number]
    const yExt = d3.extent(allDocs, d => d.umap_y) as [number, number]
    const xScale = d3.scaleLinear().domain(xExt).range([pad, width - pad])
    const yScale = d3.scaleLinear().domain(yExt).range([height - pad, pad])

    const focalId = detail.argument.source_document_id
    const relatedMap = new Map<string, string>() // docId → relation group
    detail.relations.forEach(r => relatedMap.set(r.source_document_id, r.group))
    const focalDoc = allDocs.find(d => d.id === focalId)

    // Lines focal → related (behind dots)
    if (focalDoc) {
      const lineG = svg.append('g')
      detail.relations.forEach(rel => {
        const target = allDocs.find(d => d.id === rel.source_document_id)
        if (!target || target.id === focalId) return
        lineG.append('line')
          .attr('x1', xScale(focalDoc.umap_x)).attr('y1', yScale(focalDoc.umap_y))
          .attr('x2', xScale(target.umap_x)).attr('y2', yScale(target.umap_y))
          .attr('stroke', RELATION_COLORS[rel.group])
          .attr('stroke-width', Math.max(0.5, rel.confidence * 2))
          .attr('opacity', 0.65)
          .append('title').text(`${rel.relation_type} · ${rel.confidence.toFixed(2)}`)
      })
    }

    // Dots
    const dotG = svg.append('g')
    dotG.selectAll('circle')
      .data(allDocs)
      .join('circle')
      .attr('cx', d => xScale(d.umap_x))
      .attr('cy', d => yScale(d.umap_y))
      .attr('r', d => d.id === focalId ? 5 : relatedMap.has(d.id) ? 3.5 : 2)
      .attr('fill', d =>
        d.id === focalId ? '#F4A124'
        : relatedMap.has(d.id) ? '#118ab2'
        : '#d1d5db')
      .append('title').text(d => d.title)

    // Amber ring around focal
    if (focalDoc) {
      dotG.append('circle')
        .attr('cx', xScale(focalDoc.umap_x)).attr('cy', yScale(focalDoc.umap_y))
        .attr('r', 9).attr('fill', 'none').attr('stroke', '#F4A124').attr('stroke-width', 2)
    }
  }, [detail, allDocs])

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: 180, display: 'block', background: '#fafbfc', borderRadius: 8 }}
    />
  )
}
```

- [ ] **Step 2: Create RelationList.tsx**

```tsx
// src/views/DetailView/RelationList.tsx
import type { ArgumentDetail } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<string, boolean>
}

export function RelationList({ detail, visibleGroups }: Props) {
  const visible = detail.relations.filter(r => visibleGroups[r.group])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
      {visible.map((rel, i) => (
        <div key={i} className="card-mid" style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              background: RELATION_COLORS[rel.group], color: rel.group === 'causal' ? '#073b4c' : '#fff',
              borderRadius: 20, padding: '2px 8px', fontSize: 9, fontWeight: 700,
            }}>
              {rel.relation_type}
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#F4A124' }}>{rel.confidence.toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#073b4c', marginBottom: 2 }}>
            {rel.source_document_title} · p.{rel.page_reference}
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
            "{rel.full_predicate}"
          </div>
        </div>
      ))}
      {visible.length === 0 && (
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 24 }}>
          No relations match current filters.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create DetailFilterRail.tsx**

```tsx
// src/views/DetailView/DetailFilterRail.tsx
import type { ArgumentDetail, RelationGroup } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<RelationGroup, boolean>
  onToggleGroup: (group: RelationGroup) => void
}

export function detailRailSections({ detail, visibleGroups, onToggleGroup }: Props) {
  return [
    {
      id: 'focus', icon: '◎', label: 'Focus',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="sl">Argument</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#073b4c' }}>{detail.argument.id}</div>
          <div style={{ fontSize: 9, color: '#6b7280' }}>{detail.argument.source_document_title}</div>
          <div style={{ fontSize: 9, color: '#F4A124', fontWeight: 700 }}>
            conf {detail.argument.confidence.toFixed(2)}
          </div>
        </div>
      ),
    },
    {
      id: 'relations', icon: '↔', label: 'Relation filter',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['positive', 'negative', 'causal'] as const).map(group => (
            <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={visibleGroups[group]}
                onChange={() => onToggleGroup(group)}
                style={{ accentColor: '#073b4c' }}
              />
              <span style={{ width: 14, height: 2, background: RELATION_COLORS[group], display: 'inline-block', borderRadius: 1 }} />
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </label>
          ))}
        </div>
      ),
    },
  ]
}
```

- [ ] **Step 4: Create DetailView.tsx**

```tsx
// src/views/DetailView/DetailView.tsx
import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { dataService } from '../../data/DataService'
import { FilterRail } from '../../components/FilterRail/FilterRail'
import { DetailMiniMap } from './DetailMiniMap'
import { RelationList } from './RelationList'
import { detailRailSections } from './DetailFilterRail'
import type { ArgumentDetail, DocNode, RelationGroup } from '../../types'
import styles from './DetailView.module.css'

const DEFAULT_GROUPS: Record<RelationGroup, boolean> = {
  positive: true, negative: true, causal: true, structural: false,
}

export function DetailView() {
  const { selectedNodeId } = useStore()
  const [detail, setDetail] = useState<ArgumentDetail | null>(null)
  const [allDocs, setAllDocs] = useState<DocNode[]>([])
  const [visibleGroups, setVisibleGroups] = useState(DEFAULT_GROUPS)

  useEffect(() => { dataService.getDocuments().then(setAllDocs) }, [])

  useEffect(() => {
    if (!selectedNodeId) return
    dataService.getArgumentDetail(selectedNodeId).then(setDetail)
  }, [selectedNodeId])

  const toggleGroup = (group: RelationGroup) =>
    setVisibleGroups(g => ({ ...g, [group]: !g[group] }))

  if (!detail) {
    return (
      <div className={styles.empty}>
        Select a node in the Graph view to open its detail.
      </div>
    )
  }

  return (
    <div className={styles.view}>
      <FilterRail sections={detailRailSections({ detail, visibleGroups, onToggleGroup: toggleGroup })} />
      <div className={styles.content}>
        <div className={styles.header}>
          <div className="sl">Argument</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#073b4c', marginBottom: 4 }}>
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
          <RelationList detail={detail} visibleGroups={visibleGroups} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create DetailView.module.css**

```css
.view    { display: flex; height: 100%; overflow: hidden; }
.empty   { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 12px; color: #9ca3af; }
.content { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 16px; gap: 12px; }
.header  { flex-shrink: 0; }
.mapWrapper { flex-shrink: 0; border-radius: 12px; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(17,138,178,0.18), 0 2px 6px rgba(7,59,76,0.06); }
.listWrapper { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
```

- [ ] **Step 6: Update App.tsx to use all three views**

```tsx
import { Shell } from './components/Shell/Shell'
import { CorpusView } from './views/CorpusView/CorpusView'
import { GraphView } from './views/GraphView/GraphView'
import { DetailView } from './views/DetailView/DetailView'

export function App() {
  return (
    <Shell>
      <CorpusView />
      <GraphView />
      <DetailView />
    </Shell>
  )
}
```

- [ ] **Step 7: Verify full flow in browser**

1. Open http://localhost:5173 — Corpus view loads 20 red dots.
2. Lasso-select several docs → amber dots, status bar updates, "View Graph →" appears.
3. Click "View Graph →" → slide animation, graph loads with navy argument nodes in concentric tiers, blue entity circles, light blue concept diamonds, faint rings.
4. Click an Argument node → amber halo, detail card bottom-right shows document title, confidence, outgoing relations. "Open full detail →" appears in top bar.
5. Click "Open full detail →" (or card button) → Detail view slides in. Mini-map shows all docs as grey dots, focal doc with amber ring, coloured lines to related docs. Scrollable relation list below.
6. Detail filter rail: toggle relation groups → list and mini-map lines update.

- [ ] **Step 8: Run all tests**

```bash
npm run test:run
```
Expected: 14 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/views/DetailView src/App.tsx
git commit -m "feat: implement Detail View with corpus reach mini-map and relation list"
```

---

### Task 12: Final Polish + Integration Commit

**Files:** No new files — visual fixes and final commit.

- [ ] **Step 1: Remove Vite boilerplate**

Delete `src/assets/react.svg` and `public/vite.svg`. Remove any import of those files from the scaffolded `App.tsx` (already replaced in Task 8).

```bash
rm -f src/assets/react.svg public/vite.svg
```

- [ ] **Step 2: Add `resolveJsonModule` check in tsconfig**

Verify `tsconfig.json` contains in `compilerOptions`:
```json
"resolveJsonModule": true,
"moduleResolution": "bundler"
```
If `moduleResolution` is missing or set to `node`, set it to `bundler` (Vite default for modern TS).

- [ ] **Step 3: Run final test suite**

```bash
npm run test:run
```
Expected: 14 tests pass, 0 failures.

- [ ] **Step 4: Final smoke test in browser**

Walk through: Corpus → lasso select → Graph → click argument → Detail → filter by relation group → back to Corpus (tab click) → Clear selection → repeat.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: GraphVisor v1 complete — all three views wired end-to-end"
```
