// Conservative variant detection for Pool Review. These produce review
// FLAGS only — they never remove or exclude a candidate. A relationship is
// reported only when one explicitly supported transformation turns one
// candidate into an EXACT match of another. No substring/prefix matching,
// no general stemming, no synonym or semantic judgment.

// Lexical words of a human-readable answer, preserved so plural detection
// can respect word boundaries that the construction form (GREATDANE) loses.
// Split on whitespace and hyphens; apostrophes join within a word, matching
// construction normalization ("Dog's Bed" → ["DOGS", "BED"]).
export function lexicalWords(sourceAnswer: string): string[] {
  return sourceAnswer
    .split(/[\s-]+/)
    .map((word) => word.replace(/['’]/g, '').toUpperCase())
    .filter((word) => word.length > 0)
}

// Never enter plural transformations: they end in S but aren't simple plurals.
export const PLURAL_S_EXCEPTIONS = new Set(['NEWS', 'SERIES', 'SPECIES'])

/**
 * Possible singular forms of a plural-looking word, under the supported v1
 * rules only: -IES → -Y; -CHES/-SHES/-SES/-XES/-ZES → drop ES; final -S →
 * drop S (never after SS, US or IS). Each rule only proposes a form; a flag
 * needs an exact match elsewhere in the pool. Empty for words those rules
 * don't cover, and always empty for PLURAL_S_EXCEPTIONS.
 */
export function singularCandidates(word: string): string[] {
  if (PLURAL_S_EXCEPTIONS.has(word) || !word.endsWith('S')) return []
  const forms: string[] = []
  // At least two letters before IES, so short words (PIES, TIES) aren't reduced to fragments.
  if (word.endsWith('IES') && word.length >= 5) forms.push(`${word.slice(0, -3)}Y`)
  if (/(CH|SH|S|X|Z)ES$/.test(word)) forms.push(word.slice(0, -2))
  if (!/(SS|US|IS)$/.test(word)) forms.push(word.slice(0, -1))
  return forms
}

/** Stems of a single word under the supported v1 suffix rules: exactly -ING or -ED removed. */
export function morphologicalStems(word: string): string[] {
  const stems: string[] = []
  if (word.endsWith('ING')) stems.push(word.slice(0, -3))
  if (word.endsWith('ED')) stems.push(word.slice(0, -2))
  return stems
}

export interface VariantInput {
  id: string
  lexicalWords: string[]
}

export interface VariantPair {
  type: 'singular-plural-conflict' | 'possible-morphological-variant'
  /** [the transformed candidate (plural / suffixed), the exact match it produced] */
  ids: [string, string]
}

// Finds variant pairs among VALID, UNIQUE candidates (callers exclude
// invalid entries and duplicate copies first).
export function findVariantPairs(candidates: VariantInput[]): VariantPair[] {
  const byPhrase = new Map<string, string>()
  for (const candidate of candidates) byPhrase.set(candidate.lexicalWords.join(' '), candidate.id)

  const pairs: VariantPair[] = []
  const seen = new Set<string>()
  const add = (type: VariantPair['type'], from: string, to: string | undefined) => {
    if (to === undefined || to === from) return
    const key = `${type}|${from}|${to}`
    if (seen.has(key)) return
    seen.add(key)
    pairs.push({ type, ids: [from, to] })
  }

  for (const candidate of candidates) {
    const words = candidate.lexicalWords
    if (words.length === 0) continue
    // Singular/plural: preceding words must match exactly; only the final word is transformed.
    const preceding = words.slice(0, -1)
    for (const singular of singularCandidates(words[words.length - 1])) {
      add('singular-plural-conflict', candidate.id, byPhrase.get([...preceding, singular].join(' ')))
    }
    // Morphology: single-word answers only.
    if (words.length === 1) {
      for (const stem of morphologicalStems(words[0])) {
        add('possible-morphological-variant', candidate.id, byPhrase.get(stem))
      }
    }
  }
  return pairs
}
