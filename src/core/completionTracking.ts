// Local-only completion history: no accounts, no server, no database —
// just a per-browser record of which puzzle dates have been solved, kept
// in localStorage. Feeds the Archive calendar's existing "Completed" date
// styling; there's nothing to display or manage in Settings itself.

const STORAGE_KEY = 'cluecross:completed-dates'

// Keyed by date AND puzzle id, not just date: which puzzle occupies a given
// date can change (e.g. a new daily puzzle takes over "today"), and a date
// being solved under one puzzle must not carry over as "completed" for a
// different puzzle that later lands on that same date.
function makeKey(dateKey: string, puzzleId: string): string {
  return `${dateKey}:${puzzleId}`
}

function readCompletedDates(): Record<string, true> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, true>) : {}
  } catch {
    // localStorage unavailable (private browsing, quota, disabled) or the
    // stored value is corrupt — treat it as if nothing has been completed.
    return {}
  }
}

export function isDateCompleted(dateKey: string, puzzleId: string): boolean {
  return !!readCompletedDates()[makeKey(dateKey, puzzleId)]
}

export function markDateCompleted(dateKey: string, puzzleId: string): void {
  const completed = readCompletedDates()
  const key = makeKey(dateKey, puzzleId)
  if (completed[key]) return
  completed[key] = true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completed))
  } catch {
    // Storage unavailable — completion just won't persist this session.
  }
}
