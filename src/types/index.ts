export interface DocNode {
  id: string
  title: string
  year: number
  pca_x: number
  pca_y: number
  argument_count: number
  citations: number
  topic_id: number
  top_terms: string[]
  termCounts: Record<string, number>
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null
}

export interface Topic {
  id: number
  label: string
  docIds: string[]
  argCount: number
}

export type GraphNodeType = 'Argument' | 'Entity' | 'Concept'
export type RelationGroup = 'evidence' | 'correlation' | 'causation' | 'definition' | 'concept'
export type ActiveView = 'corpus' | 'graph' | 'detail' | 'discover'
export type SizeBy = 'argument_count' | 'impact' | 'uniform'
export type CorpusViewMode = 'map' | 'topics' | 'timeline'

// What the concept hierarchy side panel has selected, used to scope the graph.
// A flat set of argument ids (built by checking individual arguments and/or
// whole concepts). Everything is selected by default.
export interface SelectedScope {
  argumentIds: string[]
}

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  full_text?: string
  confidence: number
  source_document_id?: string
  source_document_title?: string
  page_reference?: number
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null
}

export interface GraphEdge {
  id: string
  source: string | GraphNode
  target: string | GraphNode
  relation_type: string
  confidence: number
  group: RelationGroup
  full_predicate?: string
  source_document_title?: string
  reasoning?: string
}

export interface ArgumentRelation {
  relation_type: string
  confidence: number
  group: RelationGroup
  source_document_id: string
  source_document_title: string
  page_reference: number
  full_predicate: string
  target_argument_id: string
  source_argument_id?: string
  subject?: string
  object?: string
  subject_id?: string
  reasoning?: string
}

export interface EntityTriple {
  subject: string
  object: string
  relation_type: string
  confidence: number
  group: RelationGroup
}

export interface ArgumentDetail {
  argument: GraphNode
  relations: ArgumentRelation[]
  sources: DocNode[]
  argumentBlobs?: ArgumentBlob[]
  entityGraph?: EntityTriple[]
}

export interface ConceptArgument {
  id: string
  argument_type: string
  full_argument: string
  confidence: number
  source_document_id: string
  source_document_title: string
}

export interface ConceptDocStat {
  docId: string
  total: number          // total arguments in the document
  withConcept: number    // arguments in the document carrying this concept
}

export interface ConceptDetail {
  conceptId: string
  label: string
  arguments: ConceptArgument[]
  docStats: ConceptDocStat[]
}

export interface ArgumentBlob {
  id: string                   // e.g. "doc_0_arg_3"
  entityIds: string[]          // entity node IDs from this argument's relations
  full_argument: string
  argument_type: string
  confidence: number
  source_document_id: string
  source_document_title: string
  concept_id: number
  parent_concepts: string[]
}

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

export interface FilterState {
  nodeTypes: Record<GraphNodeType, boolean>
  minConfidence: number
  relationTypes: Record<string, boolean>
}
