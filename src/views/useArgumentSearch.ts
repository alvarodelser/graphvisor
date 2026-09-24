import { useEffect, useState } from 'react'
import { dataService, type ArgumentSearchResult } from '../data/DataService'

const DEBOUNCE_MS = 350
const MIN_CHARS = 3

// Semantic argument search for a search bar: debounced, and each new query
// cancels the request still in flight for the previous one.
export function useArgumentSearch(query: string, k = 30) {
  const [results, setResults] = useState<ArgumentSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_CHARS) { setResults([]); setLoading(false); setError(null); return }
    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      dataService.searchArguments(q, k, controller.signal)
        .then(r => { setResults(r); setError(null) })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return
          setError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, DEBOUNCE_MS)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, k])

  return { results, loading, error, active: query.trim().length >= MIN_CHARS }
}
