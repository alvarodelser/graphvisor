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
