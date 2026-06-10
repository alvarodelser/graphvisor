import type { GraphNode, GraphEdge, ArgumentBlob } from '../types'

export interface GraphModel {
  entities: GraphNode[]
  entityIds: Set<string>
  edges: GraphEdge[]                          // entity-entity edges only
  adjacency: Map<string, Set<string>>        // entity id -> neighbour entity ids
  adjacentEdges: Map<string, Set<string>>    // entity id -> incident edge ids
  degree: Map<string, number>
  chainOf: Map<string, string>               // entity id -> chain (component) id
  chainSizes: Map<string, number>            // chain id -> entity count
  chainsBySize: string[]                     // chain ids, descending size
  arguments: ArgumentBlob[]
  argMembers: Map<string, string[]>          // arg id -> member entity ids
  entityArgs: Map<string, string[]>          // entity id -> arg ids
  soloEntities: Set<string>
  bridgeEntities: Set<string>
  conceptArgs: Map<string, string[]>         // concept id -> arg ids
  argConcept: Map<string, string>            // arg id -> concept id
  conceptLabels: Map<string, string>         // concept id -> label
}

const edgeEnd = (e: GraphEdge, which: 'source' | 'target'): string => {
  const v = e[which]
  return typeof v === 'string' ? v : (v as GraphNode).id
}

export function buildGraphModel(
  nodes: GraphNode[],
  edges: GraphEdge[],
  blobs: ArgumentBlob[],
): GraphModel {
  const entities = nodes.filter(n => n.type === 'Entity')
  const entityIds = new Set(entities.map(n => n.id))

  const entEdges = edges.filter(
    e => entityIds.has(edgeEnd(e, 'source')) && entityIds.has(edgeEnd(e, 'target')),
  )

  const adjacency = new Map<string, Set<string>>()
  const adjacentEdges = new Map<string, Set<string>>()
  const degree = new Map<string, number>()
  entities.forEach(n => {
    adjacency.set(n.id, new Set())
    adjacentEdges.set(n.id, new Set())
    degree.set(n.id, 0)
  })
  entEdges.forEach(e => {
    const s = edgeEnd(e, 'source'), t = edgeEnd(e, 'target')
    adjacency.get(s)!.add(t)
    adjacency.get(t)!.add(s)
    adjacentEdges.get(s)!.add(e.id)
    adjacentEdges.get(t)!.add(e.id)
    degree.set(s, degree.get(s)! + 1)
    degree.set(t, degree.get(t)! + 1)
  })

  // Connected components via union-find
  const parent = new Map<string, string>()
  entities.forEach(n => parent.set(n.id, n.id))
  const find = (id: string): string => {
    let p = parent.get(id)!
    while (p !== parent.get(p)!) { parent.set(p, parent.get(parent.get(p)!)!); p = parent.get(p)! }
    return p
  }
  entEdges.forEach(e => {
    const rs = find(edgeEnd(e, 'source')), rt = find(edgeEnd(e, 'target'))
    if (rs !== rt) parent.set(rs, rt)
  })
  const chainOf = new Map<string, string>()
  entities.forEach(n => chainOf.set(n.id, find(n.id)))
  const chainSizes = new Map<string, number>()
  entities.forEach(n => {
    const c = chainOf.get(n.id)!
    chainSizes.set(c, (chainSizes.get(c) ?? 0) + 1)
  })
  const chainsBySize = [...chainSizes.keys()].sort(
    (a, b) => (chainSizes.get(b)! - chainSizes.get(a)!) || (a < b ? -1 : 1),
  )

  // Arguments: keep only those whose members are all present entities
  const args = blobs.filter(b => b.entityIds.every(id => entityIds.has(id)))
  const argMembers = new Map<string, string[]>()
  const entityArgs = new Map<string, string[]>()
  args.forEach(a => {
    argMembers.set(a.id, [...a.entityIds])
    a.entityIds.forEach(eid => {
      if (!entityArgs.has(eid)) entityArgs.set(eid, [])
      entityArgs.get(eid)!.push(a.id)
    })
  })
  const soloEntities = new Set<string>()
  const bridgeEntities = new Set<string>()
  // Solo = appears in exactly one argument blob; bridge = appears in two or more.
  // Entities in zero blobs are intentionally in neither set. This is argument-
  // membership classification, NOT graph-topological bridge detection.
  for (const [eid, ids] of entityArgs) {
    if (ids.length > 1) bridgeEntities.add(eid)
    else soloEntities.add(eid)
  }

  // Concepts: merge arguments by first parent-concept label
  const conceptArgs = new Map<string, string[]>()
  const argConcept = new Map<string, string>()
  const conceptLabels = new Map<string, string>()
  args.forEach(a => {
    const label = a.parent_concepts[0] ?? `concept-${a.concept_id}`
    const cid = `concept-${label}`
    argConcept.set(a.id, cid)
    conceptLabels.set(cid, label)
    if (!conceptArgs.has(cid)) conceptArgs.set(cid, [])
    conceptArgs.get(cid)!.push(a.id)
  })

  return {
    entities, entityIds, edges: entEdges, adjacency, adjacentEdges, degree,
    chainOf, chainSizes, chainsBySize, arguments: args, argMembers, entityArgs,
    soloEntities, bridgeEntities, conceptArgs, argConcept, conceptLabels,
  }
}
