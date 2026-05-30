import type { DocNode, GraphNode, GraphEdge, ArgumentDetail, ArgumentRelation } from '../types'
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

  async getGraph(documentIds: string[]): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const allNodes = graphJson.nodes as unknown as GraphNode[]
    const allEdges = graphJson.edges as unknown as GraphEdge[]

    if (documentIds.length === 0) return { nodes: allNodes, edges: allEdges }

    // Arguments whose source document is in the selection
    const relevantArgIds = new Set(
      allNodes
        .filter(n => n.type === 'Argument' && documentIds.includes(n.source_document_id ?? ''))
        .map(n => n.id)
    )
    if (relevantArgIds.size === 0) return { nodes: [], edges: [] }

    // Expand to include all entity/concept neighbours connected to those arguments
    const relevantIds = new Set<string>(relevantArgIds)
    allEdges.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      if (relevantArgIds.has(sid)) relevantIds.add(tid)
      if (relevantArgIds.has(tid)) relevantIds.add(sid)
    })

    const nodes = allNodes.filter(n => relevantIds.has(n.id))
    const edges = allEdges.filter(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      return relevantIds.has(sid) && relevantIds.has(tid)
    })

    return { nodes, edges }
  }

  async getArgumentDetail(argumentId: string): Promise<ArgumentDetail> {
    const allNodes = graphJson.nodes as unknown as GraphNode[]
    const allEdges = graphJson.edges as unknown as GraphEdge[]
    const allDocs = documentsJson as DocNode[]

    const argument = allNodes.find(n => n.id === argumentId && n.type === 'Argument')

    // Fall back to the static detail.json for arg_001 or unknown IDs
    if (!argument) return detailJson as unknown as ArgumentDetail
    if (argumentId === 'arg_001') return detailJson as unknown as ArgumentDetail

    // Build relations from semantic edges connected to this argument
    const relations: ArgumentRelation[] = allEdges
      .filter(e => {
        const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
        const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        return e.group !== 'structural' && (sid === argumentId || tid === argumentId)
      })
      .map(e => {
        const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
        const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
        const targetId = sid === argumentId ? tid : sid
        return {
          relation_type: e.relation_type,
          confidence: e.confidence,
          group: e.group,
          source_document_id: argument.source_document_id ?? '',
          source_document_title: e.source_document_title ?? argument.source_document_title ?? '',
          page_reference: argument.page_reference ?? 0,
          full_predicate: e.full_predicate ?? '',
          target_argument_id: targetId,
        }
      })

    const sources = allDocs.filter(d => d.id === argument.source_document_id)

    return { argument, relations, sources }
  }
}

export const dataService: DataServiceInterface = new MockDataService()
