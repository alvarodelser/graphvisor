import { describe, it, expect } from 'vitest'
import { pickK, mostFrequentLabel, buildTopics } from './topics'

describe('pickK', () => {
  it('adapts k = clamp(round(sqrt(n/2)), 2, 12), capped at n', () => {
    expect(pickK(5)).toBe(2)      // round(sqrt(2.5)) = 2
    expect(pickK(200)).toBe(10)   // round(sqrt(100)) = 10
    expect(pickK(1)).toBe(1)      // capped at n
    expect(pickK(2)).toBe(2)
    expect(pickK(1000)).toBe(12)  // clamped to max 12
  })
})

describe('mostFrequentLabel', () => {
  it('returns the most frequent label across docs', () => {
    expect(mostFrequentLabel([['a', 'b'], ['a'], ['c']])).toBe('a')
  })
  it('breaks ties lexicographically for determinism', () => {
    expect(mostFrequentLabel([['b'], ['a']])).toBe('a')
  })
  it('returns empty string when there are no labels', () => {
    expect(mostFrequentLabel([[], []])).toBe('')
  })
})

describe('buildTopics', () => {
  it('groups docs by cluster index with label, docIds, argCount', () => {
    const docs = [
      { id: 'doc_0', argument_count: 3 },
      { id: 'doc_1', argument_count: 5 },
      { id: 'doc_2', argument_count: 2 },
    ]
    const assignments = [0, 1, 0]
    const labels = new Map([[0, 'recombination'], [1, 'dna repair']])
    const topics = buildTopics(assignments, docs, labels)
    expect(topics).toEqual([
      { id: 0, label: 'recombination', docIds: ['doc_0', 'doc_2'], argCount: 5 },
      { id: 1, label: 'dna repair', docIds: ['doc_1'], argCount: 5 },
    ])
  })
})
