export interface DocNode {
  id: string
  title: string
  year: number
  pca_x: number
  pca_y: number
  argument_count: number
  page_count: number
  top_terms: string[]
  termCounts: Record<string, number>
  x?: number; y?: number; vx?: number; vy?: number; fx?: number | null; fy?: number | null
}

export type GraphNodeType = 'Argument' | 'Entity' | 'Concept'
export type RelationGroup = 'positive' | 'negative' | 'causal' | 'structural'
export type ActiveView = 'corpus' | 'graph' | 'detail'
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
}

export interface ArgumentDetail {
  argument: GraphNode
  relations: ArgumentRelation[]
  sources: DocNode[]
  argumentBlobs?: ArgumentBlob[]
}

export interface ArgumentBlob {
  id: string                   // e.g. "doc_0_arg_3"
  entityIds: string[]          // entity node IDs from this argument's relations
  full_argument: string
  argument_type: string
  confidence: number
  source_document_id: string
  source_document_title: string
}

export const RELATION_TYPE_GROUPS: Record<string, RelationGroup> = {
  SUPPORTS: 'positive',
  CORRELATES_WITH: 'positive',
  REVEALS: 'positive',
  CONTRADICTS: 'negative',
  CAUSES: 'causal',
  ASSOCIATED_WITH: 'causal',
  HAS_SUBJECT: 'structural',
  HAS_OBJECT: 'structural',
  HAS_CONCEPT: 'structural',
}

export interface FilterState {
  nodeTypes: Record<GraphNodeType, boolean>
  minConfidence: number
  relationTypes: Record<string, boolean>
}
