// Copy to Manual: a one-time copy of the reviewed sourced words into the
// manual word list, so they can be edited by hand. Nothing links the two
// afterwards — the copy is plain text in poolText, and later sourcing or
// review changes never touch it.
//
// What's copied is what the sourced pool contributes to generation: the
// valid, canonical candidates the author has left included, as their
// human-readable answers. A word is skipped when the manual list already
// has it in construction form (the same comparison Pool Diagnostics uses
// to find duplicates: case, spaces, hyphens, and apostrophes ignored).
// Existing manual text is kept exactly; new words are appended, one per line.

import { toConstructionForm } from '../../../tools/generator/src/input.js'
import { splitPoolText } from '../parsePool'
import { isIncludable } from './reviewPool'
import type { ReviewCandidate } from './reviewPool'

/** The sourced words Copy to Manual would copy, in Pool Review order. */
export function copyableSourcedWords(candidates: readonly ReviewCandidate[]): string[] {
  return candidates.filter((candidate) => isIncludable(candidate) && candidate.included).map((candidate) => candidate.sourceAnswer)
}

export function copySourcedToManual(
  poolText: string,
  candidates: readonly ReviewCandidate[],
): { poolText: string; added: string[] } {
  const present = new Set(
    splitPoolText(poolText)
      .map((entry) => toConstructionForm(entry.trim()))
      .filter((entry) => entry !== ''),
  )
  const added: string[] = []
  for (const word of copyableSourcedWords(candidates)) {
    const form = toConstructionForm(word)
    if (present.has(form)) continue
    present.add(form)
    added.push(word)
  }
  if (added.length === 0) return { poolText, added }
  const separator = poolText === '' || poolText.endsWith('\n') ? '' : '\n'
  return { poolText: poolText + separator + added.join('\n'), added }
}
