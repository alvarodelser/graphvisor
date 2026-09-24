import { useMemo, useState } from 'react'
import { useStore } from '../../store/useStore'
import { SearchBar, type SearchSection } from '../../components/SearchBar/SearchBar'
import { lexicalSearch } from '../../utils/lexicalSearch'
import { useArgumentSearch } from '../useArgumentSearch'
import type { DocNode } from '../../types'
import styles from './CorpusView.module.css'

const snippet = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)

// Corpus search: document titles by words, and arguments by meaning (each hit
// shown as its document, with the best-matching argument). Picking a result adds
// that document to the selection.
export function CorpusSearch({ docs }: { docs: DocNode[] }) {
  const [query, setQuery] = useState('')
  const { selectedDocumentIds, setSelectedDocuments } = useStore()
  const semantic = useArgumentSearch(query, 40)
  const byId = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs])

  const select = (ids: string[]) => setSelectedDocuments([...new Set([...selectedDocumentIds, ...ids])])

  const titleHits = useMemo(() => lexicalSearch(query, docs, d => d.title, 15), [query, docs])

  // best argument per document, documents ordered by their best score
  const argumentDocs = useMemo(() => {
    const best = new Map<string, (typeof semantic.results)[number]>()
    for (const r of semantic.results) {
      if (byId.has(r.docId) && !best.has(r.docId)) best.set(r.docId, r)
    }
    return [...best.values()].slice(0, 15)
  }, [semantic.results, byId])

  const sections: SearchSection[] = [
    {
      title: 'Titles', kind: 'lexical',
      items: titleHits.map(d => ({
        key: d.id, primary: d.title,
        secondary: `${d.argument_count} arguments${selectedDocumentIds.includes(d.id) ? ' · selected' : ''}`,
        onPick: () => select([d.id]),
      })),
      action: { label: `Select all ${titleHits.length}`, onClick: () => select(titleHits.map(d => d.id)) },
    },
    {
      title: 'Arguments', kind: 'semantic',
      loading: semantic.loading,
      error: semantic.error ? 'Semantic search unavailable' : null,
      note: semantic.active ? null : 'Type at least 3 characters to search by meaning',
      items: argumentDocs.map(r => ({
        key: r.docId, primary: byId.get(r.docId)!.title,
        secondary: `“${snippet(r.text)}”`, score: r.score,
        onPick: () => select([r.docId]),
      })),
      action: { label: `Select all ${argumentDocs.length}`, onClick: () => select(argumentDocs.map(r => r.docId)) },
    },
  ]

  return (
    <div className={styles.search}>
      <SearchBar placeholder="Search titles and arguments" query={query} onQueryChange={setQuery} sections={sections} />
    </div>
  )
}
