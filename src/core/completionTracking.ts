// Local-only completion history: no accounts, no server, no database —
// just a per-browser record of which puzzle dates have been solved, kept
// in localStorage. Feeds the Archive calendar's existing "Completed" date
// styling; there's nothing to display or manage in Settings itself.

const STORAGE_KEY = 'cluecross:completed-dates'

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

export function isDateCompleted(dateKey: string): boolean {
  return !!readCompletedDates()[dateKey]
}

export function markDateCompleted(dateKey: string): void {
  const completed = readCompletedDates()
  if (completed[dateKey]) return
  completed[dateKey] = true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(completed))
  } catch {
    // Storage unavailable — completion just won't persist this session.
  }
}
