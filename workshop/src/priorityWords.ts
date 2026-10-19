// Priority Words: words from the active mode's usable candidate pool that
// every generated candidate must contain — a hard constraint the generator
// enforces itself (requiredAnswers), never a preference. They are picked
// from pool.usableAnswers, which are already in construction form, so they
// never add to, duplicate, or rewrite the pool.
//
// Selections are kept even when a word later leaves the pool (an edited
// list, an excluded or re-sourced candidate): the missing word blocks
// Generate until the author restores it or removes it explicitly, so a
// Priority Word is never silently dropped.

import type { PoolDiagnostic } from './poolDiagnostics'

// Equal to the Workshop's minAnswers (10), so every target subset size can
// hold all of them; the generator rejects more than minAnswers itself.
export const MAX_PRIORITY_WORDS = 10

export interface PriorityToggle {
  selection: string[]
  /** True when adding was refused because MAX_PRIORITY_WORDS are already selected. */
  limitReached: boolean
}

/** Deselects a selected word, or selects a new one unless the limit is reached. Never duplicates. */
export function togglePriorityWord(selection: readonly string[], word: string): PriorityToggle {
  if (selection.includes(word)) return { selection: selection.filter((w) => w !== word), limitReached: false }
  if (selection.length >= MAX_PRIORITY_WORDS) return { selection: [...selection], limitReached: true }
  return { selection: [...selection, word], limitReached: false }
}

export function missingPriorityWords(selection: readonly string[], usableAnswers: readonly string[]): string[] {
  const usable = new Set(usableAnswers)
  return selection.filter((word) => !usable.has(word))
}

function listWords(words: string[]): string {
  if (words.length <= 2) return words.join(' and ')
  return `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`
}

/**
 * Error-severity diagnostics for the active mode's Priority Words, in the
 * same shape as the pool's own so they render and block Generate the same
 * way. The isolated-word check is a proof, not a heuristic: every answer in
 * a puzzle of 2+ answers must cross another, which needs a shared letter.
 */
export function analyzePriorityWords(selection: readonly string[], usableAnswers: readonly string[]): PoolDiagnostic[] {
  const diagnostics: PoolDiagnostic[] = []

  const missing = missingPriorityWords(selection, usableAnswers)
  if (missing.length === 1) {
    diagnostics.push({
      code: 'priority-word-missing',
      severity: 'error',
      message: `${missing[0]} is a Priority Word but is no longer in your candidate list. Restore it or remove it from Priority Words to continue.`,
    })
  } else if (missing.length > 1) {
    diagnostics.push({
      code: 'priority-word-missing',
      severity: 'error',
      message: `${listWords(missing)} are Priority Words but are no longer in your candidate list. Restore them or remove them from Priority Words to continue.`,
    })
  }

  if (selection.length > MAX_PRIORITY_WORDS) {
    diagnostics.push({
      code: 'too-many-priority-words',
      severity: 'error',
      message: `${selection.length} Priority Words are selected; the maximum is ${MAX_PRIORITY_WORDS}. Remove some to continue.`,
    })
  }

  const available = selection.filter((word) => !missing.includes(word))
  const isolated = available.filter((word) => {
    const letters = new Set(word)
    return !usableAnswers.some((other) => other !== word && [...other].some((letter) => letters.has(letter)))
  })
  if (isolated.length > 0) {
    const one = isolated.length === 1
    diagnostics.push({
      code: 'priority-word-isolated',
      severity: 'error',
      message:
        `${listWords(isolated)} ${one ? 'shares' : 'share'} no letters with any other candidate word, so ` +
        `${one ? 'it' : 'they'} can never cross another answer and no generated puzzle can include ` +
        `${one ? 'it' : 'them'}. Remove ${one ? 'it' : 'them'} from Priority Words or add candidate words that share ` +
        `${one ? 'its' : 'their'} letters.`,
    })
  }

  return diagnostics
}
