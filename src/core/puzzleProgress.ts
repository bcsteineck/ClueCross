import type { PuzzleProgress } from './gameEngine'

// Unfinished-puzzle progress, so a refresh or a later visit in the same
// browser continues the same game instead of starting over (with fresh
// free reveals). Same pattern as puzzleResults.ts/completionTracking.ts:
// one localStorage map keyed by `${publishDate}:${puzzleId}`, every access
// guarded. Browser- and device-specific, like completed results — not a
// defense against someone deliberately clearing storage.
//
// Only an unfinished game with some progress has an entry. A completed
// puzzle's canonical record stays in cluecross:puzzle-results; its
// progress entry is removed. What's stored is the minimal replayable form
// (see restoreGameState); this module only checks the record's shape.

const STORAGE_KEY = 'cluecross:puzzle-progress'
const VERSION = 1

interface StoredProgress extends PuzzleProgress {
  v: typeof VERSION
}

function makeKey(dateKey: string, puzzleId: string): string {
  return `${dateKey}:${puzzleId}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function readAll(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return isRecord(parsed) ? parsed : {}
  } catch {
    // Storage unavailable or corrupt — treat as no saved progress.
    return {}
  }
}

function writeAll(all: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // Storage unavailable or full — progress just won't persist.
  }
}

/** The saved progress for this puzzle, or undefined if there is none or it isn't a version-1 record. */
export function getPuzzleProgress(dateKey: string, puzzleId: string): PuzzleProgress | undefined {
  const stored = readAll()[makeKey(dateKey, puzzleId)]
  if (!isRecord(stored) || stored.v !== VERSION || !isRecord(stored.values) || !Array.isArray(stored.reveals)) {
    return undefined
  }
  const values: Record<string, string> = {}
  for (const [cellId, value] of Object.entries(stored.values)) {
    if (typeof value !== 'string') return undefined
    values[cellId] = value
  }
  if (!stored.reveals.every((letter): letter is string => typeof letter === 'string')) return undefined
  return { values, reveals: [...stored.reveals] }
}

/** Saves unfinished progress; an untouched game (no values, no reveals) removes the entry instead. */
export function savePuzzleProgress(dateKey: string, puzzleId: string, progress: PuzzleProgress): void {
  if (Object.keys(progress.values).length === 0 && progress.reveals.length === 0) {
    clearPuzzleProgress(dateKey, puzzleId)
    return
  }
  const all = readAll()
  const record: StoredProgress = { v: VERSION, values: progress.values, reveals: progress.reveals }
  all[makeKey(dateKey, puzzleId)] = record
  writeAll(all)
}

export function clearPuzzleProgress(dateKey: string, puzzleId: string): void {
  const all = readAll()
  const key = makeKey(dateKey, puzzleId)
  if (!(key in all)) return
  delete all[key]
  writeAll(all)
}
