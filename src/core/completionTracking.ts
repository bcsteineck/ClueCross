// Local-only completion history: no accounts, no server, no database —
// just a per-browser record of which puzzle dates have been solved, kept
// in localStorage. Feeds the Archive calendar's existing "Completed" date
// styling; there's nothing to display or manage in Settings itself.

const STORAGE_KEY = 'cluecross:completed-dates'

// Keyed by publish date AND puzzle id (`${publishDate}:${puzzleId}`).
// Published dates are permanent, so the pair names exactly one publication;
// the id also keeps history from before the published calendar (when
// development puzzles moved between dates) from ever matching a published
// puzzle on the same date.
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

/** Test tools only (Reset Test State): forgets one puzzle's completion. */
export function clearDateCompleted(dateKey: string, puzzleId: string): void {
  const completed = readCompletedDates()
  const key = makeKey(dateKey, puzzleId)
  if (!completed[key]) return
  delete completed[key]
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completed))
  } catch {
    // Storage unavailable — nothing persisted to clear.
  }
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
