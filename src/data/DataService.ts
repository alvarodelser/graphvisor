import type { DocNode, GraphNode, GraphEdge, ArgumentDetail, ArgumentRelation, ArgumentBlob, EntityTriple, RelationGroup, Hypothesis, ConceptDetail, ConceptArgument, ConceptDocStat } from '../types'
import { PCA } from 'ml-pca'
import corpusJson from './corpus_final_dat.json'
import hypothesisJson from './hypothesis_L2.json'

export interface DataServiceInterface {
  getDocuments(): Promise<DocNode[]>
  getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; blobs: ArgumentBlob[] }>
  getArgumentDetail(nodeId: string): Promise<ArgumentDetail>
  getConceptDetail(conceptLabel: string): Promise<ConceptDetail>
  getHypotheses(): Promise<Hypothesis[]>
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
  arg_id: number
  concept_level: {
    concept_id: number
    parent_concepts: string[]
  }
}

type RawDoc = {
  source: string
  year: string
  abstract: string
  data: RawArgument[]
  doc_embbeding: number[]
}

// ── PCA projection from stored embeddings ────────────────────────────────────

const rawDocs = corpusJson as RawDoc[]

const PCA_SCORES: Array<{ pca_x: number; pca_y: number }> = (() => {
  const embeddings = rawDocs.map(d => d.doc_embbeding)
  const pca = new PCA(embeddings)
  const projected = pca.predict(embeddings, { nComponents: 2 }).to2DArray()
  return projected.map((row: number[]) => ({ pca_x: row[0], pca_y: row[1] }))
})()

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

const RELATION_GROUP_MAP: Record<string, RelationGroup> = {
  analogous_to:   'positive',
  associated_with:'causal',
  causes:         'causal',
  correlates_with:'positive',
  decreases:      'negative',
  describes:      'structural',
  increases:      'positive',
  induces:        'causal',
  inhibits:       'negative',
  is_defined_as:  'structural',
  may_cause:      'causal',
  reveals:        'positive',
  suggests:       'positive',
  supports:       'positive',
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
      title: `${doc.source} (${doc.year})`,
      year: parseInt(doc.year, 10),
      ...(PCA_SCORES[i] ?? { pca_x: 0, pca_y: 0 }),
      argument_count: doc.data.length,
      page_count: 0,
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
        group: RELATION_GROUP_MAP[re.relation] ?? 'causal',
        full_predicate: re.full_predicate,
        source_document_title: rawDocs[re.docIdx].source,
        reasoning: re.reasoning,
        docIdx: re.docIdx,
      })
    }
  })

  const semanticEdges = Array.from(edgeMap.values()).map(({ docIdx: _dropped, ...e }) => e)

  // Build HAS_CONCEPT edges: Argument node → Concept node
  const conceptEdges: GraphEdge[] = blobs
    .filter(blob => blob.parent_concepts[0])
    .map((blob, i) => ({
      id: `hc_${i}`,
      source: blob.id,
      target: conceptId(blob.parent_concepts[0]),
      relation_type: 'HAS_CONCEPT',
      confidence: blob.confidence,
      group: 'concept' as const,
      source_document_title: blob.source_document_title,
    }))

  const edges = [...semanticEdges, ...conceptEdges]

  return { nodes, edges, blobs, entityDocs, rawEdges, entityBlobs }
}

const CACHED_DOCS  = buildDocs()
const CACHED_GRAPH = buildGraphData()

// ── Service implementation ────────────────────────────────────────────────────

export class RealDataService implements DataServiceInterface {
  async getDocuments(): Promise<DocNode[]> {
    return CACHED_DOCS
  }

  async getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; blobs: ArgumentBlob[] }> {
    const { nodes: allNodes, edges: allEdges, blobs: allBlobs, entityDocs } = CACHED_GRAPH

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
    // Argument blob ID: doc_\d+_arg_\d+
    const argMatch = nodeId.match(/^doc_(\d+)_arg_(\d+)$/)
    if (argMatch) {
      const docIdx = parseInt(argMatch[1])
      const argIdx = parseInt(argMatch[2])
      const rawDoc = rawDocs[docIdx]
      const rawArg = rawDoc?.data[argIdx]
      if (!rawArg) throw new Error(`Argument ${nodeId} not found`)

      const blob = CACHED_GRAPH.blobs.find(b => b.id === nodeId)

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
        group: RELATION_GROUP_MAP[rel.relation] ?? 'causal',
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
        group: RELATION_GROUP_MAP[rel.relation] ?? 'causal',
      }))

      return { argument: syntheticNode, relations, sources, entityGraph }
    }

    // Entity node path
    const { nodes: allNodes, rawEdges, entityBlobs } = CACHED_GRAPH

    const node = allNodes.find(n => n.id === nodeId)
    if (!node) throw new Error(`Node ${nodeId} not found`)

    const involvedRaw = rawEdges.filter(
      re => entityId(re.source) === nodeId || entityId(re.target) === nodeId
    )

    const relations: ArgumentRelation[] = involvedRaw.map(re => ({
      relation_type: re.relation.toUpperCase(),
      confidence: re.confidence,
      group: RELATION_GROUP_MAP[re.relation] ?? 'causal',
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
}

export const dataService: DataServiceInterface = new RealDataService()
