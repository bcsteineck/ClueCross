// Turns the Workshop's free-text word-pool field into a candidate pool,
// reporting every problem instead of silently dropping anything.
//
// Words are separated by newlines or commas (the two ways authors
// actually paste lists). Spaces are NOT separators: "ICE CREAM" stays one
// entry and is flagged by the generator's own A-Z rule, rather than being
// quietly split into two unrelated answers.
//
// Validity is decided by the generator's own normalizeAnswers — called
// once per entry so each problem can be attributed to the word that
// caused it — so the Workshop never re-implements the generator's input
// rules. Duplicates are detected here because a per-entry call can't see
// them; the generator would reject them too (it never silently
// deduplicates), so the Workshop surfaces them the same way.

import { normalizeAnswers } from '../../tools/generator/src/input.js'

export interface InvalidWord {
  raw: string
  reason: string
}

export interface DuplicateWord {
  word: string
  count: number
}

export interface ParsedPool {
  /** Valid, normalized, first-occurrence order, each word once. */
  words: string[]
  invalid: InvalidWord[]
  duplicates: DuplicateWord[]
}

export function parsePool(text: string): ParsedPool {
  const entries = text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  const words: string[] = []
  const invalid: InvalidWord[] = []
  const counts = new Map<string, number>()

  for (const raw of entries) {
    const result = normalizeAnswers([raw])
    if (!result.ok) {
      invalid.push({ raw, reason: result.errors.join(' ') })
      continue
    }
    const word = result.answers[0]
    const count = counts.get(word) ?? 0
    counts.set(word, count + 1)
    if (count === 0) words.push(word)
  }

  const duplicates: DuplicateWord[] = []
  for (const [word, count] of counts) {
    if (count > 1) duplicates.push({ word, count })
  }

  return { words, invalid, duplicates }
}
