import { getStarCount } from './awardLevel'
import type { RevealHistoryEntry } from './types'

// A separate store (and storage key) from completionTracking.ts on purpose:
// that module's existing values are a plain `true` boolean, and reusing its
// key with a richer shape would risk an old stored `true` crashing code
// that expects an object. This key only ever holds the shape below.
const STORAGE_KEY = 'cluecross:puzzle-results'

export interface PuzzleResult {
  score: number
  revealHistory: RevealHistoryEntry[]
}

function makeKey(dateKey: string, puzzleId: string): string {
  return `${dateKey}:${puzzleId}`
}

function readResults(): Record<string, PuzzleResult> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, PuzzleResult>) : {}
  } catch {
    return {}
  }
}

export function getPuzzleResult(dateKey: string, puzzleId: string): PuzzleResult | undefined {
  return readResults()[makeKey(dateKey, puzzleId)]
}

export function getPuzzleResultStarCount(dateKey: string, puzzleId: string): 0 | 1 | 2 | 3 | undefined {
  const result = getPuzzleResult(dateKey, puzzleId)
  return result ? getStarCount(result.score) : undefined
}

// Idempotent, like markDateCompleted: only the first recorded result for a
// given date+puzzle is kept, since that's the score/history that was live
// when the puzzle actually completed.
export function recordPuzzleResult(
  dateKey: string,
  puzzleId: string,
  result: PuzzleResult,
): void {
  const results = readResults()
  const key = makeKey(dateKey, puzzleId)
  if (results[key]) return
  results[key] = result
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(results))
  } catch {
    // Storage unavailable — the result just won't persist this session.
  }
}
