# Entity Detail — Arguments Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an Entity node is selected in the Detail view, show (1) an argument cards section at the top with entity label highlighted in the text, and (2) a grouped relation table with a merged "Argument" column. Argument blob detail path is unchanged.

**Architecture:** Extend `RawEdgeRecord` with `argIdx` so each raw relation can be traced back to its source argument. Build an `entityBlobs` reverse index in `buildGraphData`. Expose both via `ArgumentDetail`: new `argumentBlobs` field drives the top cards; `source_argument_id` on each `ArgumentRelation` drives grouping in the table. When `argumentBlobs` is absent (Argument node selected), both new surfaces are hidden — no regression.

**Tech Stack:** React 18, TypeScript, CSS Grid, Vitest

---

### Task 1: Extend types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `source_argument_id` to `ArgumentRelation` and `argumentBlobs` to `ArgumentDetail`**

In `src/types/index.ts`, update the two interfaces:

```ts
export interface ArgumentRelation {
  relation_type: string
  confidence: number
  group: RelationGroup
  source_document_id: string
  source_document_title: string
  page_reference: number
  full_predicate: string
  target_argument_id: string
  source_argument_id?: string   // blob ID "doc_N_arg_M", entity-path only
}

export interface ArgumentDetail {
  argument: GraphNode
  relations: ArgumentRelation[]
  sources: DocNode[]
  argumentBlobs?: ArgumentBlob[]  // entity-path only; absent for Argument blob detail
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build 2>&1 | head -30`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: extend ArgumentRelation and ArgumentDetail types for entity argument blobs"
```

---

### Task 2: Extend DataService — argIdx on raw edges and entity→blobs index

**Files:**
- Modify: `src/data/DataService.ts`

- [ ] **Step 1: Add `argIdx` to `RawEdgeRecord`**

Update the `RawEdgeRecord` interface (currently around line 112):

```ts
interface RawEdgeRecord {
  source: string
  target: string
  relation: string
  confidence: number
  docIdx: number
  argIdx: number        // index of this argument within the document's data array
  full_predicate: string
}
```

- [ ] **Step 2: Populate `argIdx` when pushing to `rawEdges`**

Inside `buildGraphData`, the push to `rawEdges` is inside:
`rawDocs.forEach((doc, docIdx) => { doc.data.forEach((arg, argIdx) => { ... rawEdges.push({...}) }) })`

`argIdx` is already in scope. Update the push:

```ts
rawEdges.push({
  source: s,
  target: o,
  relation: rel.relation,
  confidence: rel.confidence,
  docIdx,
  argIdx,
  full_predicate: `${s} ${rel.relation.replace(/_/g, ' ')} ${o}`,
})
```

- [ ] **Step 3: Build `entityBlobs` map and add it to `buildGraphData` return**

After the `rawDocs.forEach` loop ends (after all blobs have been pushed), add:

```ts
const entityBlobs = new Map<string, ArgumentBlob[]>()
for (const blob of blobs) {
  for (const eid of blob.entityIds) {
    if (!entityBlobs.has(eid)) entityBlobs.set(eid, [])
    entityBlobs.get(eid)!.push(blob)
  }
}
```

Update the return type of `buildGraphData`:

```ts
function buildGraphData(): {
  nodes: GraphNode[]
  edges: GraphEdge[]
  blobs: ArgumentBlob[]
  entityDocs: Map<string, Set<number>>
  rawEdges: RawEdgeRecord[]
  entityBlobs: Map<string, ArgumentBlob[]>
}
```

Update the return statement:

```ts
return { nodes, edges, blobs, entityDocs, rawEdges, entityBlobs }
```

- [ ] **Step 4: Populate `source_argument_id` and `argumentBlobs` in the entity path of `getArgumentDetail`**

In `getArgumentDetail`, the entity-path section starts after `// Entity node path`. Replace it entirely with:

```ts
// Entity node path
const { nodes: allNodes, rawEdges, entityBlobs } = CACHED_GRAPH

const node = allNodes.find(n => n.id === nodeId)
if (!node) throw new Error(`Node ${nodeId} not found`)

const involvedRaw = rawEdges.filter(
  re => entityId(re.source) === nodeId || entityId(re.target) === nodeId
)

const relations: ArgumentRelation[] = involvedRaw.map(re => {
  const isSource = entityId(re.source) === nodeId
  const otherLabel = isSource ? re.target : re.source
  const otherId = entityId(otherLabel)
  return {
    relation_type: re.relation.toUpperCase(),
    confidence: re.confidence,
    group: RELATION_GROUP_MAP[re.relation] ?? 'causal',
    source_document_id: makeDocId(re.docIdx),
    source_document_title: rawDocs[re.docIdx].source,
    page_reference: 0,
    full_predicate: re.full_predicate,
    target_argument_id: otherId,
    source_argument_id: `doc_${re.docIdx}_arg_${re.argIdx}`,
  }
})

const docIndices = new Set(involvedRaw.map(re => re.docIdx))
const sources = CACHED_DOCS.filter(d => {
  const idx = parseInt(d.id.split('_')[1])
  return docIndices.has(idx)
})

return {
  argument: node,
  relations,
  sources,
  argumentBlobs: entityBlobs.get(nodeId) ?? [],
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npm run build 2>&1 | head -30`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/data/DataService.ts
git commit -m "feat: add argIdx to raw edges and entity-to-blobs index in DataService"
```

---

### Task 3: Tests for new DataService fields

**Files:**
- Modify: `tests/DataService.test.ts`

- [ ] **Step 1: Add test suite for the new fields**

Append the following `describe` block to `tests/DataService.test.ts`:

```ts
describe('entity detail — argument blobs and source_argument_id', () => {
  it('entity detail includes a non-empty argumentBlobs array', async () => {
    const { nodes } = await svc.getGraph([])
    const entityNode = nodes[0]
    const detail = await svc.getArgumentDetail(entityNode.id)
    expect(Array.isArray(detail.argumentBlobs)).toBe(true)
    expect((detail.argumentBlobs ?? []).length).toBeGreaterThan(0)
  })

  it('entity detail relations all have a valid source_argument_id', async () => {
    const { nodes } = await svc.getGraph([])
    const entityNode = nodes[0]
    const detail = await svc.getArgumentDetail(entityNode.id)
    for (const rel of detail.relations) {
      expect(rel.source_argument_id).toMatch(/^doc_\d+_arg_\d+$/)
    }
  })

  it('argumentBlobs each contain the queried entity id', async () => {
    const { nodes } = await svc.getGraph([])
    const entityNode = nodes[0]
    const detail = await svc.getArgumentDetail(entityNode.id)
    for (const blob of detail.argumentBlobs ?? []) {
      expect(blob.entityIds).toContain(entityNode.id)
    }
  })

  it('argument blob detail does not include argumentBlobs', async () => {
    const { blobs } = await svc.getGraph([])
    const detail = await svc.getArgumentDetail(blobs[0].id)
    expect(detail.argumentBlobs).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `npm run test:run`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/DataService.test.ts
git commit -m "test: verify entity detail argumentBlobs and source_argument_id"
```

---

### Task 4: ArgumentCards component

**Files:**
- Create: `src/views/DetailView/ArgumentCards.tsx`

- [ ] **Step 1: Create the component**

Create `src/views/DetailView/ArgumentCards.tsx`:

```tsx
import type { ArgumentBlob } from '../../types'

const ARGUMENT_TYPE_COLORS: Record<string, string> = {
  mechanistic: '#6366f1',
  evidence:    '#059669',
  hypothesis:  '#d97706',
  causal:      '#ef4444',
}

function argTypeColor(type: string): string {
  return ARGUMENT_TYPE_COLORS[type.toLowerCase()] ?? '#6b7280'
}

function highlightText(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === label.toLowerCase()
      ? <mark key={i} style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : <span key={i}>{part}</span>
  )
}

interface Props {
  blobs: ArgumentBlob[]
  entityLabel: string
  onBlobClick: (blobId: string) => void
}

export function ArgumentCards({ blobs, entityLabel, onBlobClick }: Props) {
  if (blobs.length === 0) return null

  return (
    <div style={{
      maxHeight: 180, overflowY: 'auto',
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '8px 12px',
      borderBottom: '1px solid rgba(7,59,76,0.1)',
    }}>
      <span className="sl" style={{ marginBottom: 2, flexShrink: 0 }}>
        {blobs.length} argument{blobs.length !== 1 ? 's' : ''} mentioning this entity
      </span>
      {blobs.map(blob => (
        <div
          key={blob.id}
          onClick={() => onBlobClick(blob.id)}
          style={{
            border: '1px solid rgba(7,59,76,0.1)', borderRadius: 6,
            padding: '7px 10px', cursor: 'pointer', background: '#fafafa', flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f0f4f8' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fafafa' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              background: argTypeColor(blob.argument_type), color: '#fff',
              borderRadius: 10, padding: '1px 7px', fontSize: 9, fontWeight: 700,
              textTransform: 'capitalize', flexShrink: 0,
            }}>
              {blob.argument_type}
            </span>
            <span style={{
              fontSize: 9, color: '#6b7280',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {blob.source_document_title}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
            {highlightText(blob.full_argument, entityLabel)}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build 2>&1 | head -30`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/views/DetailView/ArgumentCards.tsx
git commit -m "feat: add ArgumentCards component for entity argument excerpts with highlighting"
```

---

### Task 5: Grouped relation table in RelationList

**Files:**
- Modify: `src/views/DetailView/RelationList.tsx`

Notes on behavior change:
- When `detail.argumentBlobs` is present (Entity selected): 5-column grid with merged argument cell on the left. Clicking the argument cell navigates to that blob. Clicking the source cell navigates to the connected entity.
- When `detail.argumentBlobs` is absent (Argument selected): 4-column grid, unchanged from current behavior. Clicking anywhere on the row navigates as before.

- [ ] **Step 1: Replace the entire file**

Replace `src/views/DetailView/RelationList.tsx` with:

```tsx
import type { ReactNode } from 'react'
import type { ArgumentDetail, ArgumentRelation, ArgumentBlob } from '../../types'
import { RELATION_COLORS } from '../../utils/geometry'

const ARGUMENT_TYPE_COLORS: Record<string, string> = {
  mechanistic: '#6366f1',
  evidence:    '#059669',
  hypothesis:  '#d97706',
  causal:      '#ef4444',
}

function argTypeColor(type: string): string {
  return ARGUMENT_TYPE_COLORS[type.toLowerCase()] ?? '#6b7280'
}

const GROUP_TEXT_COLOR: Record<string, string> = {
  positive: '#fff', negative: '#fff', causal: '#073b4c', structural: '#073b4c',
}

interface RelGroup {
  blobId: string | null
  blob: ArgumentBlob | null
  relations: ArgumentRelation[]
}

function groupRelations(relations: ArgumentRelation[], blobs: ArgumentBlob[] | undefined): RelGroup[] {
  if (!blobs) {
    return relations.map(r => ({ blobId: null, blob: null, relations: [r] }))
  }
  const blobById = new Map(blobs.map(b => [b.id, b]))
  const groups: RelGroup[] = []
  const seen = new Map<string, RelGroup>()
  for (const rel of relations) {
    const key = rel.source_argument_id ?? '__none__'
    if (!seen.has(key)) {
      const g: RelGroup = {
        blobId: rel.source_argument_id ?? null,
        blob: rel.source_argument_id ? (blobById.get(rel.source_argument_id) ?? null) : null,
        relations: [],
      }
      seen.set(key, g)
      groups.push(g)
    }
    seen.get(key)!.relations.push(rel)
  }
  return groups
}

interface Props {
  detail: ArgumentDetail
  visibleGroups: Record<string, boolean>
  onRowClick: (rel: ArgumentRelation) => void
  onBlobClick?: (blobId: string) => void
  focalId: string
}

export function RelationList({ detail, visibleGroups, onRowClick, onBlobClick, focalId }: Props) {
  const visible = detail.relations.filter(r => visibleGroups[r.group])
  const hasArgCol = !!detail.argumentBlobs
  const groups = groupRelations(visible, detail.argumentBlobs)
  const colTemplate = hasArgCol ? '140px 90px 36px 1fr 1fr' : '90px 36px 1fr 1fr'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: colTemplate,
        gap: '0 8px', padding: '4px 12px',
        background: '#fff', borderBottom: '1px solid rgba(7,59,76,0.1)', flexShrink: 0,
      }}>
        {hasArgCol && <span className="sl" style={{ margin: 0 }}>Argument</span>}
        <span className="sl" style={{ margin: 0 }}>Relation</span>
        <span className="sl" style={{ margin: 0 }}>Conf</span>
        <span className="sl" style={{ margin: 0 }}>Source</span>
        <span className="sl" style={{ margin: 0 }}>Predicate</span>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {groups.map((group, gi) => {
          const n = group.relations.length
          const cells: ReactNode[] = []
          const relCol = hasArgCol ? 2 : 1

          if (hasArgCol) {
            cells.push(
              <div
                key="arg"
                onClick={() => group.blobId && onBlobClick?.(group.blobId)}
                style={{
                  gridColumn: 1, gridRow: `1 / ${n + 1}`,
                  padding: '8px 6px',
                  borderRight: '1px solid rgba(7,59,76,0.06)',
                  cursor: group.blobId ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'start',
                }}
                onMouseEnter={e => { if (group.blobId) e.currentTarget.style.background = '#f4f7fa' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                {group.blob && (
                  <>
                    <span style={{
                      background: argTypeColor(group.blob.argument_type), color: '#fff',
                      borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 700,
                      textTransform: 'capitalize', alignSelf: 'flex-start',
                    }}>
                      {group.blob.argument_type}
                    </span>
                    <div style={{ fontSize: 9, color: '#374151', lineHeight: 1.4 }}>
                      {group.blob.full_argument.slice(0, 80)}…
                    </div>
                  </>
                )}
              </div>
            )
          }

          group.relations.forEach((rel, ri) => {
            const isSelf = rel.target_argument_id === focalId

            cells.push(
              <div key={`rel-${ri}`} style={{
                gridColumn: relCol, gridRow: ri + 1,
                padding: '8px 0', alignSelf: 'start',
              }}>
                <span style={{
                  background: RELATION_COLORS[rel.group],
                  color: GROUP_TEXT_COLOR[rel.group] ?? '#fff',
                  borderRadius: 20, padding: '2px 7px', fontSize: 9, fontWeight: 700,
                  display: 'inline-block', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                }}>
                  {rel.relation_type}
                </span>
              </div>
            )
            cells.push(
              <span key={`conf-${ri}`} style={{
                gridColumn: relCol + 1, gridRow: ri + 1,
                fontSize: 10, fontWeight: 700, color: '#F4A124',
                padding: '8px 0', alignSelf: 'start', whiteSpace: 'nowrap',
              }}>
                {rel.confidence.toFixed(2)}
              </span>
            )
            cells.push(
              <div
                key={`src-${ri}`}
                onClick={() => { if (!hasArgCol && !isSelf) onRowClick(rel) }}
                style={{
                  gridColumn: relCol + 2, gridRow: ri + 1,
                  fontSize: 10, fontWeight: 600, color: '#073b4c',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  minWidth: 0, padding: '8px 0', alignSelf: 'start',
                  cursor: (!hasArgCol && !isSelf) ? 'pointer' : 'default',
                  opacity: isSelf ? 0.5 : 1,
                }}
                onMouseEnter={e => { if (!hasArgCol && !isSelf) e.currentTarget.style.color = '#1a6b8a' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#073b4c' }}
              >
                {rel.source_document_title.split(' — ')[0]} · p.{rel.page_reference}
              </div>
            )
            cells.push(
              <div
                key={`pred-${ri}`}
                onClick={() => { if (hasArgCol && !isSelf) onRowClick(rel) }}
                style={{
                  gridColumn: relCol + 3, gridRow: ri + 1,
                  fontSize: 10, color: '#374151', lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  padding: '8px 0', minWidth: 0, alignSelf: 'start',
                  cursor: (hasArgCol && !isSelf) ? 'pointer' : 'default',
                }}
                onMouseEnter={e => { if (hasArgCol && !isSelf) e.currentTarget.style.background = '#f4f7fa' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                "{rel.full_predicate}"
              </div>
            )
          })

          return (
            <div
              key={gi}
              style={{
                display: 'grid', gridTemplateColumns: colTemplate,
                gap: '0 8px', padding: '0 12px',
                borderBottom: '1px solid rgba(7,59,76,0.06)',
              }}
            >
              {cells}
            </div>
          )
        })}

        {visible.length === 0 && (
          <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: 24 }}>
            No relations match current filters.
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build 2>&1 | head -30`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/views/DetailView/RelationList.tsx
git commit -m "feat: group relation table by argument with merged argument column"
```

---

### Task 6: Wire ArgumentCards into DetailView

**Files:**
- Modify: `src/views/DetailView/DetailView.tsx`

- [ ] **Step 1: Import ArgumentCards**

Add to the import block at the top of `src/views/DetailView/DetailView.tsx`:

```tsx
import { ArgumentCards } from './ArgumentCards'
```

- [ ] **Step 2: Add `navigateToBlob` handler**

After the existing `navigateBack` function, add:

```tsx
const navigateToBlob = (blobId: string) => {
  if (!detail) return
  setNavStack(prev => [...prev, detail.argument.id])
  setSelectedNode(blobId)
}
```

- [ ] **Step 3: Render ArgumentCards and pass onBlobClick**

In the JSX return, insert `<ArgumentCards />` between the header `<div>` and the `<div className={styles.mapWrapper}>`:

```tsx
{detail.argumentBlobs && detail.argumentBlobs.length > 0 && (
  <ArgumentCards
    blobs={detail.argumentBlobs}
    entityLabel={detail.argument.label}
    onBlobClick={navigateToBlob}
  />
)}
```

Also add `onBlobClick` to the existing `<RelationList />` call:

```tsx
<RelationList
  detail={detail}
  visibleGroups={visibleGroups}
  onRowClick={navigateToArgument}
  onBlobClick={navigateToBlob}
  focalId={detail.argument.id}
/>
```

- [ ] **Step 4: Verify TypeScript compiles and all tests pass**

Run: `npm run build 2>&1 | head -30 && npm run test:run`
Expected: no errors, all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/views/DetailView/DetailView.tsx
git commit -m "feat: wire ArgumentCards and grouped RelationList into DetailView"
```
