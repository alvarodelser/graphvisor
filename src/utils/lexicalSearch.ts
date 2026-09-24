// Lexical search in the browser: every word of the query must appear in the
// text (case- and accent-insensitive; a word may be the start of a longer one).
// Whole-phrase matches rank first, then matches at the start of the text, then
// shorter texts.

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function words(s: string): string[] {
  return normalize(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

export function lexicalScore(query: string, text: string): number {
  const q = words(query)
  if (q.length === 0) return 0
  const t = normalize(text)
  const tw = words(text)
  if (!q.every(w => tw.some(x => x.startsWith(w)))) return 0
  const phrase = q.join(' ')
  let score = 1
  if (t.includes(phrase)) score += 2
  if (t.startsWith(phrase)) score += 1
  return score + 1 / (1 + tw.length / 10)
}

export function lexicalSearch<T>(query: string, items: T[], text: (item: T) => string, limit = 20): T[] {
  return items
    .map(item => ({ item, score: lexicalScore(query, text(item)) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.item)
}
