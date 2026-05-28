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
