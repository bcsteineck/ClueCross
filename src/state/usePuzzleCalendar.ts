import { useCallback, useEffect, useRef, useState } from 'react'
import type { PuzzleCalendar, PuzzleCalendarClient } from '../data/puzzleCalendar'

export type CalendarState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; calendar: PuzzleCalendar }

export interface PuzzleCalendarControls {
  state: CalendarState
  /** Re-runs a failed initial load. */
  retry: () => void
  /**
   * Re-fetches the calendar in the background (e.g. when Archive opens) so
   * a newly released puzzle can appear. A failed or out-of-order refresh is
   * ignored, keeping the calendar already in use.
   */
  refresh: () => void
}

// The released calendar for this page session. Each request gets a
// sequence number; only the newest response is applied, so a slow earlier
// load or refresh can never overwrite a newer one.
export function usePuzzleCalendar(client: PuzzleCalendarClient): PuzzleCalendarControls {
  const [state, setState] = useState<CalendarState>({ status: 'loading' })
  const sequence = useRef(0)

  const load = useCallback(
    (mode: 'initial' | 'refresh') => {
      const request = ++sequence.current
      if (mode === 'initial') setState({ status: 'loading' })
      void client.fetchCalendar().then((result) => {
        if (request !== sequence.current) return
        if (mode === 'refresh') {
          // Only a usable, non-empty calendar replaces the one in use.
          if (result.ok && result.calendar.current) setState({ status: 'ready', calendar: result.calendar })
          return
        }
        if (!result.ok) setState({ status: 'error' })
        else if (!result.calendar.current) setState({ status: 'empty' })
        else setState({ status: 'ready', calendar: result.calendar })
      })
    },
    [client],
  )

  useEffect(() => {
    load('initial')
  }, [load])

  return {
    state,
    retry: useCallback(() => load('initial'), [load]),
    refresh: useCallback(() => load('refresh'), [load]),
  }
}
