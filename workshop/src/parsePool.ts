// Turns the Workshop's free-text word-pool field into raw candidate
// entries and analyzes them (see poolDiagnostics.ts).
//
// Entries are separated by newlines or commas (the two ways authors
// actually paste lists). Spaces are NOT separators: "ICE CREAM" stays one
// entry and is excluded as invalid by the generator's own A-Z rule, rather
// than being quietly split into two unrelated answers.

import { analyzeCandidatePool } from './poolDiagnostics'
import type { CandidatePoolAnalysis } from './poolDiagnostics'

export function splitPoolText(text: string): string[] {
  return text.split(/[\n,]/)
}

export function parsePool(text: string): CandidatePoolAnalysis {
  return analyzeCandidatePool(splitPoolText(text))
}
