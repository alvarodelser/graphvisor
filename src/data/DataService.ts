import type { DocNode, GraphNode, GraphEdge, ArgumentDetail, ArgumentRelation, ArgumentBlob, EntityTriple, Hypothesis, ConceptDetail, ConceptArgument, ConceptDocStat, Topic } from '../types'
import { corpusJson, hypothesisJson, docEmbeddingsUrl, conceptEmbeddingsUrl, conceptsJson, topicsJson, type ConceptGrounding } from './dataset'
import { relationGroupOf } from '../graph/relations'

export interface DataServiceInterface {
  getDocuments(): Promise<DocNode[]>
  getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; blobs: ArgumentBlob[] }>
  getArgumentDetail(nodeId: string): Promise<ArgumentDetail>
  getConceptDetail(conceptLabel: string): Promise<ConceptDetail>
  getHypotheses(): Promise<Hypothesis[]>
  getTopics(): Promise<Topic[]>
  getConceptGroundings(): Promise<ConceptGrounding[]>
  getConceptEmbedding(conceptLabel: string): Promise<number[] | null>
  getDocEmbedding(docId: string): Promise<number[] | null>
  findSimilarConcepts(embedding: number[], limit?: number): Promise<{ concept: string; similarity: number }[]>
  getConceptsForDocuments(docIds: string[], confThreshold: number, cosThreshold: number): Promise<{ concept: string; score: number }[]>
}

// ── Raw JSON types ────────────────────────────────────────────────────────────

type RawRelation = {
  subject: string
  relation: string
  object: string
  confidence: number
  source_argument_id: number
  reasoning?: string
}

type RawArgument = {
  relations: RawRelation[]
  full_argument: string
  argument_type: string
  confidence: number
  arg_id: string
  concept_level: {
    concept_id: number
    parent_concepts: string[]
    parent_concepts_cos?: number[]
  }
}

type RawDoc = {
  source: string
  year?: string
  abstract?: string
  citations?: number
  data: RawArgument[]
  doc_embbeding?: number[]
  pca_x?: number
  pca_y?: number
}

function buildDocEmbeddings(docs: RawDoc[]): number[][] {
  const stored = docs.map(d => d.doc_embbeding)
  if (stored.every(e => Array.isArray(e) && e.length > 0)) {
    return stored as number[][]
  }

  const termIndex = new Map<string, number>()
  let nextIdx = 0
  for (const doc of docs) {
    for (const arg of doc.data) {
      for (const rel of arg.relations) {
        for (const term of [rel.subject.trim(), rel.object.trim()]) {
          if (!termIndex.has(term)) termIndex.set(term, nextIdx++)
        }
      }
    }
  }

  if (nextIdx === 0) {
    return docs.map((_, i) => {
      const angle = (2 * Math.PI * i) / Math.max(docs.length, 1)
      return [Math.cos(angle), Math.sin(angle)]
    })
  }

  return docs.map(doc => {
    const vec = new Array(nextIdx).fill(0)
    for (const arg of doc.data) {
      for (const rel of arg.relations) {
        for (const term of [rel.subject.trim(), rel.object.trim()]) {
          const idx = termIndex.get(term)
          if (idx !== undefined) vec[idx] += 1
        }
      }
    }
    const year = parseInt(doc.year ?? '0', 10) || 0
    vec.push(year / 10000, doc.data.length / 100)
    return vec
  })
}

// ── Lazy initialization variables ────────────────────────────────────────────

const rawDocs = corpusJson as unknown as RawDoc[]

let isInitialized = false
let initPromise: Promise<void> | null = null

let DOC_EMBEDDINGS: number[][] = []
let CONCEPT_EMBEDDINGS: number[][] = []
const CONCEPT_NAME_TO_INDEX = new Map<string, number>()
let CONCEPT_GROUNDINGS: ConceptGrounding[] = []

let TOPIC_DATA: { assignments: number[]; topics: Topic[] } = { assignments: [], topics: [] }
let CACHED_DOCS: DocNode[] = []
let CACHED_GRAPH: ReturnType<typeof buildGraphData> | null = null

// Helper to load float32 binary files
async function loadFloat32Binary(url: string, dim: number): Promise<number[][]> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch embeddings from ${url}`)
  }
  const buffer = await res.arrayBuffer()
  const floatArray = new Float32Array(buffer)
  if (floatArray.length === 0) {
    throw new Error(`Loaded empty buffer from ${url}`)
  }
  const numVectors = floatArray.length / dim
  const vectors: number[][] = []
  for (let i = 0; i < numVectors; i++) {
    const vec = Array.from(floatArray.subarray(i * dim, (i + 1) * dim))
    vectors.push(vec)
  }
  return vectors
}

// Function to guarantee that data service structures are fully loaded and prepared
export async function ensureInitialized(): Promise<void> {
  if (isInitialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      // 1. Load document embeddings (binary) — fall back to heuristic BoW vectors
      let docsEmbeds: number[][] = []
      try {
        docsEmbeds = await loadFloat32Binary(docEmbeddingsUrl, 1024)
        if (docsEmbeds.length !== rawDocs.length) {
          console.warn(`Doc embeddings count (${docsEmbeds.length}) ≠ corpus count (${rawDocs.length}). Using heuristic fallback.`)
          docsEmbeds = buildDocEmbeddings(rawDocs)
        }
      } catch {
        console.warn('Failed to load doc embeddings binary — using heuristic fallback.')
        docsEmbeds = buildDocEmbeddings(rawDocs)
      }
      DOC_EMBEDDINGS = docsEmbeds

      // 2. Load concept embeddings (binary) and concept grounding JSON
      try {
        CONCEPT_EMBEDDINGS = await loadFloat32Binary(conceptEmbeddingsUrl, 1024)
      } catch {
        console.warn('Failed to load concept embeddings binary.')
      }

      // conceptsJson is ConceptGrounding[] when produced by embed_concepts.py,
      // or legacy string[] from the placeholder. Normalise here.
      const rawConcepts = conceptsJson as unknown as Array<ConceptGrounding | string>
      if (rawConcepts.length > 0 && typeof rawConcepts[0] === 'object') {
        CONCEPT_GROUNDINGS = rawConcepts as ConceptGrounding[]
        CONCEPT_GROUNDINGS.forEach((g, idx) => CONCEPT_NAME_TO_INDEX.set(g.concept, idx))
      } else {
        // legacy flat string array — no grounding positions yet
        ;(rawConcepts as string[]).forEach((name, idx) => CONCEPT_NAME_TO_INDEX.set(name, idx))
      }

      // 3. Load pre-computed topics produced by cluster_topics.py
      //    If the JSON is populated, use it; otherwise fall back to an empty list.
      const rawTopics = topicsJson as unknown as Array<{ id: number; label: string; docIds: string[]; argCount: number }>
      if (rawTopics.length > 0) {
        // Build assignment array from the loaded topics
        const assignments = new Array<number>(rawDocs.length).fill(0)
        rawTopics.forEach(t => t.docIds.forEach(did => {
          const idx = parseInt(did.split('_')[1], 10)
          if (!isNaN(idx)) assignments[idx] = t.id
        }))
        TOPIC_DATA = {
          assignments,
          topics: rawTopics.map(t => ({ id: t.id, label: t.label, docIds: t.docIds, argCount: t.argCount })),
        }
      } else {
        // Fallback: assign everything to topic 0
        TOPIC_DATA = {
          assignments: new Array<number>(rawDocs.length).fill(0),
          topics: [{ id: 0, label: 'All documents', docIds: rawDocs.map((_, i) => makeDocId(i)), argCount: rawDocs.reduce((s, d) => s + d.data.length, 0) }],
        }
      }

      // 4. Pre-compute doc cache (needs TOPIC_DATA and pca_x/pca_y from corpus JSON)
      CACHED_DOCS = buildDocs()
      CACHED_GRAPH = buildGraphData()

      isInitialized = true
    } catch (err) {
      console.error('DataService initialization failed:', err)
      initPromise = null
      throw err
    }
  })()

  return initPromise
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '')
}

function entityId(label: string): string {
  return 'entity_' + slugify(label)
}

function conceptId(name: string): string {
  return 'concept_' + slugify(name)
}

function makeDocId(i: number): string {
  return `doc_${i}`
}

// ── Pre-compute from raw JSON ──────────────────────────────────────────────────

function buildDocs(): DocNode[] {
  return rawDocs.map((doc, i) => {
    const termCounts: Record<string, number> = {}
    doc.data.forEach(arg =>
      arg.relations.forEach(rel => {
        termCounts[rel.subject] = (termCounts[rel.subject] || 0) + 1
        termCounts[rel.object]  = (termCounts[rel.object]  || 0) + 1
      })
    )
    const top_terms = Object.entries(termCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t)

    return {
      id: makeDocId(i),
      title: `${doc.source} (${doc.year ?? ''})`,
      year: parseInt(doc.year ?? '0', 10) || 0,
      pca_x: doc.pca_x ?? 0,
      pca_y: doc.pca_y ?? 0,
      argument_count: doc.data.length,
      citations: doc.citations ?? 0,
      topic_id: TOPIC_DATA.assignments[i],
      top_terms,
      termCounts,
    }
  })
}

interface RawEdgeRecord {
  source: string
  target: string
  relation: string
  confidence: number
  docIdx: number
  argIdx: number        // index of this argument within the document's data array
  full_predicate: string
  reasoning?: string
}

function buildGraphData(): {
  nodes: GraphNode[]
  edges: GraphEdge[]
  blobs: ArgumentBlob[]
  // maps entity label → doc indices that mention it (for filtering)
  entityDocs: Map<string, Set<number>>
  rawEdges: RawEdgeRecord[]
  entityBlobs: Map<string, ArgumentBlob[]>
} {
  // Collect raw entity labels and edges
  const entityLabels = new Map<string, { totalConf: number; count: number }>()
  const entityDocs   = new Map<string, Set<number>>()
  const rawEdges: RawEdgeRecord[] = []
  const blobs: ArgumentBlob[] = []

  rawDocs.forEach((doc, docIdx) => {
    doc.data.forEach((arg, argIdx) => {
      // Collect unique entity IDs for this argument's relations
      const argEntityIds = new Set<string>()

      arg.relations.forEach(rel => {
        const s = rel.subject.trim()
        const o = rel.object.trim()

        for (const label of [s, o]) {
          if (!entityLabels.has(label)) entityLabels.set(label, { totalConf: 0, count: 0 })
          const rec = entityLabels.get(label)!
          rec.totalConf += rel.confidence
          rec.count += 1
          if (!entityDocs.has(label)) entityDocs.set(label, new Set())
          entityDocs.get(label)!.add(docIdx)
          argEntityIds.add(entityId(label))
        }

        rawEdges.push({
          source: s,
          target: o,
          relation: rel.relation,
          confidence: rel.confidence,
          docIdx,
          argIdx,
          full_predicate: `${s} ${rel.relation.replace(/_/g, ' ')} ${o}`,
          reasoning: rel.reasoning,
        })
      })

      if (argEntityIds.size >= 2) {
        blobs.push({
          id: `doc_${docIdx}_arg_${argIdx}`,
          arg_id: arg.arg_id,
          entityIds: Array.from(argEntityIds),
          full_argument: arg.full_argument,
          argument_type: arg.argument_type,
          confidence: arg.confidence,
          source_document_id: makeDocId(docIdx),
          source_document_title: doc.source,
          concept_id: arg.concept_level.concept_id,
          parent_concepts: arg.concept_level.parent_concepts,
        })
      }
    })
  })

  // Build entity → blobs reverse index
  const entityBlobs = new Map<string, ArgumentBlob[]>()
  for (const blob of blobs) {
    for (const eid of blob.entityIds) {
      if (!entityBlobs.has(eid)) entityBlobs.set(eid, [])
      entityBlobs.get(eid)!.push(blob)
    }
  }

  // Build Entity nodes
  const entityNodes: GraphNode[] = Array.from(entityLabels.entries()).map(([label, { totalConf, count }]) => ({
    id: entityId(label),
    type: 'Entity' as const,
    label,
    confidence: totalConf / count,
  }))

  // Build Concept nodes (one per unique first parent concept)
  const conceptNodeMap = new Map<string, GraphNode>()
  for (const blob of blobs) {
    const mainConcept = blob.parent_concepts[0]
    if (!mainConcept) continue
    const id = conceptId(mainConcept)
    if (!conceptNodeMap.has(id)) {
      conceptNodeMap.set(id, { id, type: 'Concept', label: mainConcept, confidence: 1 })
    }
  }

  // Build Argument nodes (one per blob)
  const argNodes: GraphNode[] = blobs.map(blob => ({
    id: blob.id,
    type: 'Argument' as const,
    label: blob.argument_type,
    full_text: blob.full_argument,
    confidence: blob.confidence,
    source_document_id: blob.source_document_id,
    source_document_title: blob.source_document_title,
  }))

  const nodes: GraphNode[] = [...entityNodes, ...argNodes, ...Array.from(conceptNodeMap.values())]

  // Build semantic GraphEdge list — dedupe by (src, tgt, relation), keep highest confidence
  const edgeMap = new Map<string, GraphEdge & { docIdx: number }>()
  rawEdges.forEach((re, i) => {
    const sid = entityId(re.source)
    const tid = entityId(re.target)
    const key = `${sid}|${tid}|${re.relation}`
    const existing = edgeMap.get(key)
    if (!existing || re.confidence > existing.confidence) {
      edgeMap.set(key, {
        id: `e_${i}`,
        source: sid,
        target: tid,
        relation_type: re.relation.toUpperCase(),
        confidence: re.confidence,
        group: relationGroupOf(re.relation),
        full_predicate: re.full_predicate,
        source_document_title: rawDocs[re.docIdx].source,
        reasoning: re.reasoning,
        docIdx: re.docIdx,
      })
    }
  })

  const semanticEdges = Array.from(edgeMap.values()).map(({ docIdx: _dropped, ...e }) => e)

  return {
    nodes,
    edges: semanticEdges,
    blobs,
    entityDocs,
    rawEdges,
    entityBlobs,
  }
}

// ── Service implementation ────────────────────────────────────────────────────

export class RealDataService implements DataServiceInterface {
  async getDocuments(): Promise<DocNode[]> {
    await ensureInitialized()
    return CACHED_DOCS
  }

  async getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; blobs: ArgumentBlob[] }> {
    await ensureInitialized()
    const { nodes: allNodes, edges: allEdges, blobs: allBlobs, entityDocs } = CACHED_GRAPH!

    if (documentIds.length === 0) return { nodes: allNodes, edges: allEdges, blobs: allBlobs }

    // Resolve selected doc indices
    const selectedIdx = new Set(
      documentIds.map(id => parseInt(id.split('_')[1])).filter(n => !isNaN(n))
    )

    // Entity nodes: keep those appearing in at least one selected document
    const relevantEntityIds = new Set(
      Array.from(entityDocs.entries())
        .filter(([, docSet]) => [...docSet].some(idx => selectedIdx.has(idx)))
        .map(([label]) => entityId(label))
    )

    // Blobs whose source doc is selected and whose entities are all present
    const blobs = allBlobs.filter(b => {
      const docIdx = parseInt(b.source_document_id.split('_')[1])
      return selectedIdx.has(docIdx) && b.entityIds.every(id => relevantEntityIds.has(id))
    })

    // Argument nodes: one per included blob
    const relevantArgIds = new Set(blobs.map(b => b.id))

    // Concept nodes: keep if any included argument references them
    const relevantConceptIds = new Set(
      blobs.filter(b => b.parent_concepts[0]).map(b => conceptId(b.parent_concepts[0]))
    )

    const relevantIds = new Set([...relevantEntityIds, ...relevantArgIds, ...relevantConceptIds])

    const nodes = allNodes.filter(n => relevantIds.has(n.id))
    const edges = allEdges.filter(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      return relevantIds.has(sid) && relevantIds.has(tid)
    })

    return { nodes, edges, blobs }
  }

  async getArgumentDetail(nodeId: string): Promise<ArgumentDetail> {
    await ensureInitialized()
    // Argument blob ID: doc_\d+_arg_\d+
    const argMatch = nodeId.match(/^doc_(\d+)_arg_(\d+)$/)
    if (argMatch) {
      const docIdx = parseInt(argMatch[1])
      const argIdx = parseInt(argMatch[2])
      const rawDoc = rawDocs[docIdx]
      const rawArg = rawDoc?.data[argIdx]
      if (!rawArg) throw new Error(`Argument ${nodeId} not found`)

      const blob = CACHED_GRAPH!.blobs.find(b => b.id === nodeId)

      const syntheticNode: GraphNode = {
        id: nodeId,
        type: 'Argument',
        label: rawArg.argument_type,
        full_text: rawArg.full_argument,
        confidence: rawArg.confidence,
        source_document_id: makeDocId(docIdx),
        source_document_title: rawDoc.source,
      }

      const relations: ArgumentRelation[] = rawArg.relations.map(rel => ({
        relation_type: rel.relation.toUpperCase(),
        confidence: rel.confidence,
        group: relationGroupOf(rel.relation),
        source_document_id: makeDocId(docIdx),
        source_document_title: rawDoc.source,
        page_reference: 0,
        full_predicate: `${rel.subject} ${rel.relation.replace(/_/g, ' ')} ${rel.object}`,
        target_argument_id: entityId(rel.object),
        subject: rel.subject.trim(),
        object: rel.object.trim(),
        subject_id: entityId(rel.subject.trim()),
        reasoning: rel.reasoning,
      }))

      const sources = [CACHED_DOCS[docIdx]].filter(Boolean)

      void blob

      const entityGraph: EntityTriple[] = rawArg.relations.map(rel => ({
        subject: rel.subject.trim(),
        object: rel.object.trim(),
        relation_type: rel.relation.toUpperCase(),
        confidence: rel.confidence,
        group: relationGroupOf(rel.relation),
      }))

      return { argument: syntheticNode, relations, sources, entityGraph }
    }

    // Entity node path
    const { nodes: allNodes, rawEdges, entityBlobs } = CACHED_GRAPH!

    const node = allNodes.find(n => n.id === nodeId)
    if (!node) throw new Error(`Node ${nodeId} not found`)

    const involvedRaw = rawEdges.filter(
      re => entityId(re.source) === nodeId || entityId(re.target) === nodeId
    )

    const relations: ArgumentRelation[] = involvedRaw.map(re => ({
      relation_type: re.relation.toUpperCase(),
      confidence: re.confidence,
      group: relationGroupOf(re.relation),
      source_document_id: makeDocId(re.docIdx),
      source_document_title: rawDocs[re.docIdx].source,
      page_reference: 0,
      full_predicate: re.full_predicate,
      target_argument_id: entityId(re.target),
      source_argument_id: `doc_${re.docIdx}_arg_${re.argIdx}`,
      subject: re.source,
      object: re.target,
      subject_id: entityId(re.source),
      reasoning: re.reasoning,
    }))

    // Unique source documents that mention this entity
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
  }

  // Concepts are grouped by their first parent-concept label (matching the graph).
  async getConceptDetail(conceptLabel: string): Promise<ConceptDetail> {
    await ensureInitialized()
    const args: ConceptArgument[] = []
    const docStats: ConceptDocStat[] = []

    rawDocs.forEach((doc, docIdx) => {
      let total = 0
      let withConcept = 0
      doc.data.forEach((arg, argIdx) => {
        total += 1
        if (arg.concept_level?.parent_concepts?.[0] === conceptLabel) {
          withConcept += 1
          args.push({
            id: `doc_${docIdx}_arg_${argIdx}`,
            argument_type: arg.argument_type,
            full_argument: arg.full_argument,
            confidence: arg.confidence,
            source_document_id: makeDocId(docIdx),
            source_document_title: doc.source,
          })
        }
      })
      docStats.push({ docId: makeDocId(docIdx), total, withConcept })
    })

    return { conceptId: `concept-${conceptLabel}`, label: conceptLabel, arguments: args, docStats }
  }

  getHypotheses(): Promise<Hypothesis[]> {
    return Promise.resolve(hypothesisJson as Hypothesis[])
  }

  async getTopics(): Promise<Topic[]> {
    await ensureInitialized()
    return TOPIC_DATA.topics
  }

  async getConceptGroundings(): Promise<ConceptGrounding[]> {
    await ensureInitialized()
    return CONCEPT_GROUNDINGS
  }

  async getConceptEmbedding(conceptLabel: string): Promise<number[] | null> {
    await ensureInitialized()
    const idx = CONCEPT_NAME_TO_INDEX.get(conceptLabel)
    if (idx === undefined) return null
    return CONCEPT_EMBEDDINGS[idx] || null
  }

  async getDocEmbedding(docId: string): Promise<number[] | null> {
    await ensureInitialized()
    const idx = parseInt(docId.split('_')[1], 10)
    if (isNaN(idx)) return null
    return DOC_EMBEDDINGS[idx] || null
  }

  async findSimilarConcepts(embedding: number[], limit = 5): Promise<{ concept: string; similarity: number }[]> {
    await ensureInitialized()
    if (CONCEPT_EMBEDDINGS.length === 0) return []

    const sims = conceptsJson.map((concept, idx) => {
      const vec = CONCEPT_EMBEDDINGS[idx]
      const similarity = vec ? cosineSimilarity(embedding, vec) : 0
      const name = typeof concept === 'object' && concept !== null ? concept.concept : (concept as unknown as string)
      return { concept: name, similarity }
    })

    return sims
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
  }

  async getConceptsForDocuments(
    docIds: string[],
    confThreshold: number,
    cosThreshold: number,
  ): Promise<{ concept: string; score: number }[]> {
    await ensureInitialized()
    const selectedIdx = new Set(
      docIds.map(id => parseInt(id.split('_')[1])).filter(n => !isNaN(n))
    )
    const conceptScores = new Map<string, number>()
    for (const idx of selectedIdx) {
      const doc = rawDocs[idx]
      if (!doc) continue
      for (const arg of doc.data) {
        if (arg.confidence < confThreshold) continue
        const { parent_concepts, parent_concepts_cos } = arg.concept_level
        if (!parent_concepts_cos) {
          for (const concept of parent_concepts) {
            conceptScores.set(concept, (conceptScores.get(concept) ?? 0) + 1)
          }
          continue
        }
        parent_concepts.forEach((concept, i) => {
          const cos = parent_concepts_cos[i] ?? 0
          if (cos >= cosThreshold) {
            conceptScores.set(concept, (conceptScores.get(concept) ?? 0) + cos)
          }
        })
      }
    }
    return [...conceptScores.entries()]
      .map(([concept, score]) => ({ concept, score }))
      .sort((a, b) => b.score - a.score)
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0
}

export const dataService: DataServiceInterface = new RealDataService()

