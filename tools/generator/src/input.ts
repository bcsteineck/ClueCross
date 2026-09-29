// Input normalization for authored-answer word lists. Only the structural
// requirements the placement engine itself depends on are enforced here —
// no dictionary lookups, no semantic/theme validation.

export interface NormalizeSuccess {
  ok: true
  answers: string[]
}

export interface NormalizeFailure {
  ok: false
  errors: string[]
}

export type NormalizeResult = NormalizeSuccess | NormalizeFailure

// Product rule: ClueCross answers are at least 3 letters (matching every
// existing hand-authored puzzle). Geometrically 2 cells would suffice —
// the production app's deriveEntryDirection only needs 2 — but 2-letter
// answers are deliberately excluded, and the Workshop's candidate-pool
// length bands (3–5 / 6–8 / 9+) rely on this floor.
const MIN_ANSWER_LENGTH = 3

const VALID_WORD = /^[A-Z]+$/

// Construction normalization: a human-readable answer ("Great Dane",
// "great-dane", "Dog's Bed") becomes its construction form (GREATDANE,
// DOGSBED) by removing the characters that separate or join words but
// occupy no puzzle cell — whitespace, hyphens, and straight/curly
// apostrophes — and uppercasing. Deliberately narrow: every other
// non-letter (digits, periods, accents, other dashes) is left in place so
// the A-Z rule rejects it visibly rather than silently rewriting the answer.
const CONSTRUCTION_SEPARATORS = /[\s\-'’]/g

export function toConstructionForm(raw: string): string {
  return raw.replace(CONSTRUCTION_SEPARATORS, '').toUpperCase()
}

export type AnswerNormalization = { ok: true; answer: string } | { ok: false; error: string }

// The single definition of a valid puzzle answer: construction form, at
// least MIN_ANSWER_LENGTH letters, A-Z only. No maximum length.
export function normalizeAnswer(raw: string): AnswerNormalization {
  const word = toConstructionForm(raw)
  if (word.length < MIN_ANSWER_LENGTH) {
    return { ok: false, error: `"${raw}" is too short (minimum ${MIN_ANSWER_LENGTH} letters).` }
  }
  if (!VALID_WORD.test(word)) {
    return { ok: false, error: `"${raw}" contains characters outside A-Z.` }
  }
  return { ok: true, answer: word }
}

// Answers must be unique (after construction normalization)
// and are rejected rather than silently deduplicated: a caller-supplied
// list that repeats a word is more likely a mistake than an intent to
// place the same word twice, and silently dropping the repeat would place
// fewer answers than asked for with no signal that anything happened.
export function normalizeAnswers(rawAnswers: string[]): NormalizeResult {
  if (rawAnswers.length === 0) {
    return { ok: false, errors: ['At least one answer is required.'] }
  }

  const errors: string[] = []
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const raw of rawAnswers) {
    const result = normalizeAnswer(raw)
    if (!result.ok) {
      errors.push(result.error)
      continue
    }
    const word = result.answer
    if (seen.has(word)) {
      errors.push(`"${word}" is a duplicate answer.`)
      continue
    }
    seen.add(word)
    normalized.push(word)
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return { ok: true, answers: normalized }
}
