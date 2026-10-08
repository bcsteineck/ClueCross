import { useCallback, useMemo, useRef, useState } from 'react'
import type { GameState } from './core/gameEngine'
import { toDateKey } from './core/archiveCalendar'
import { clearDateCompleted } from './core/completionTracking'
import { clearPuzzleProgress } from './core/puzzleProgress'
import { clearPuzzleResult, getPuzzleResultStarCount } from './core/puzzleResults'
import { archiveMonthRange, createPuzzleCalendarClient, dateFromKey } from './data/puzzleCalendar'
import type { PublishedPuzzle, PuzzleCalendar, PuzzleCalendarClient } from './data/puzzleCalendar'
import type { DateKey } from './publishing/types'
import { PuzzleSessionProvider } from './state/PuzzleSessionProvider'
import { useIsMobile } from './state/useIsMobile'
import { usePuzzleCalendar } from './state/usePuzzleCalendar'
import { TEST_TOOLS_ENABLED } from './state/testTools'
import { useReducedMotionPreference } from './state/useReducedMotionPreference'
import './App.scss'
import type { ArchiveCalendarData, ArchiveSelectionStatus } from './ui/components/ArchiveCalendar'
import { DesktopLayout } from './ui/components/DesktopLayout'
import { MobileLayout } from './ui/components/MobileLayout'
import { NavDrawer } from './ui/components/NavDrawer'
import { PlayerStatus } from './ui/components/PlayerStatus'
import type { View } from './ui/view'

const defaultCalendarClient = createPuzzleCalendarClient()

interface AppProps {
  /** Injectable for tests; defaults to the read-only puzzle API. */
  calendarClient?: PuzzleCalendarClient
  /** Manual-testing tools; defaults to the build's setting (never on in Production). */
  testTools?: boolean
}

// The player's data comes only from the published calendar API: the server
// decides which puzzles are released and which one is current. Until the
// calendar has loaded there is no puzzle to show — and never a bundled
// fallback puzzle.
function App({ calendarClient = defaultCalendarClient, testTools = TEST_TOOLS_ENABLED }: AppProps) {
  const { state, retry, refresh } = usePuzzleCalendar(calendarClient)
  if (state.status === 'loading') return <PlayerStatus kind="loading" />
  if (state.status === 'error') return <PlayerStatus kind="error" onRetry={retry} />
  if (state.status === 'empty') return <PlayerStatus kind="empty" />
  return (
    <PuzzlePlayer
      calendar={state.calendar}
      client={calendarClient}
      onArchiveOpen={refresh}
      testTools={TEST_TOOLS_ENABLED && testTools}
    />
  )
}

interface PuzzlePlayerProps {
  calendar: PuzzleCalendar
  client: PuzzleCalendarClient
  /** Called whenever Archive opens, to pick up newly released puzzles. */
  onArchiveOpen: () => void
  testTools: boolean
}

function PuzzlePlayer({ calendar, client, onArchiveOpen, testTools }: PuzzlePlayerProps) {
  const isMobile = useIsMobile()
  const [view, setView] = useState<View>('puzzle')
  // The calendar is only rendered once it has a current puzzle (see App).
  const current = calendar.current as PublishedPuzzle
  // Starts on the server's current puzzle. A later calendar refresh never
  // changes the selection: an active puzzle is never replaced under the
  // player.
  const [selectedKey, setSelectedKey] = useState<DateKey>(current.publishDate)
  // Released puzzles loaded this page session (never persisted). Seeded with
  // every current puzzle the calendar has delivered, so the current puzzle
  // never needs a second request.
  const loaded = useRef(new Map<DateKey, PublishedPuzzle>())
  loaded.current.set(current.publishDate, current)
  const [pending, setPending] = useState<{ key: DateKey; state: ArchiveSelectionStatus['state'] } | null>(null)
  // Only the newest selection's response may be applied.
  const selectionRequest = useRef(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Per-date, not global: Reset Test State on one date must not invalidate
  // the cached in-progress session of any other date.
  const [resetGenerations, setResetGenerations] = useState<Record<string, number>>({})
  const [reduceMotion, setReduceMotion] = useReducedMotionPreference()
  // Outlives the PuzzleSessionProvider remount boundary (below) so
  // switching Archive dates and back restores exact in-session progress —
  // see spec section 15 ("restores its existing saved state if previously
  // played"). Across reloads, unfinished progress is restored from
  // localStorage instead (see puzzleProgress.ts).
  const sessionCache = useRef<Record<string, GameState>>({})

  const entry = loaded.current.get(selectedKey) as PublishedPuzzle
  const selectedDate = dateFromKey(selectedKey)
  const dateKey = selectedKey
  const resetGeneration = resetGenerations[dateKey] ?? 0
  const isCurrentPuzzle = selectedKey === current.publishDate
  const puzzleIdByDate = useMemo(
    () => new Map(calendar.dates.map((date) => [date.publishDate, date.puzzleId])),
    [calendar.dates],
  )

  function handleViewChange(next: View) {
    if (next === 'archive' && view !== 'archive') onArchiveOpen()
    if (next !== 'archive') setPending(null)
    setView(next)
  }

  const selectKey = useCallback(
    (key: DateKey) => {
      const request = ++selectionRequest.current
      const showLoaded = () => {
        setPending(null)
        setSelectedKey(key)
        setView('puzzle')
      }
      if (loaded.current.has(key)) {
        showLoaded()
        return
      }
      setPending({ key, state: 'loading' })
      void client.fetchPuzzle(key).then((result) => {
        if (request !== selectionRequest.current) return
        if (result.kind === 'ready') {
          loaded.current.set(key, result.puzzle)
          showLoaded()
        } else {
          setPending({ key, state: result.kind })
        }
      })
    },
    [client],
  )

  function handleSelectDate(date: Date) {
    selectKey(toDateKey(date))
  }

  // Manual testing only (dev/Preview): forgets this one puzzle's local state
  // — its completion, saved result, and unfinished progress under
  // ${publishDate}:${puzzleId}, and its in-memory session — then remounts
  // it fresh on the same date. Never touches the published puzzle, the
  // calendar, or any other puzzle. Players have no reset (it would hand
  // back free reveals).
  function handleResetTestState() {
    clearDateCompleted(dateKey, entry.puzzle.id)
    clearPuzzleResult(dateKey, entry.puzzle.id)
    clearPuzzleProgress(dateKey, entry.puzzle.id)
    delete sessionCache.current[dateKey]
    setResetGenerations((generations) => ({
      ...generations,
      [dateKey]: (generations[dateKey] ?? 0) + 1,
    }))
  }

  // Undefined means "not completed" — a real 0-star completed result
  // (starCount 0) is a distinct, defined value from this, which is what
  // lets the Archive calendar tell it apart from an unplayed placeholder
  // (spec section 15).
  const getDateStarCount = (date: Date): 0 | 1 | 2 | 3 | undefined => {
    const key = toDateKey(date)
    const puzzleId = puzzleIdByDate.get(key)
    return puzzleId ? getPuzzleResultStarCount(key, puzzleId) : undefined
  }

  const { earliestMonth, latestMonth } = archiveMonthRange(calendar)
  const availableDates = useMemo(() => new Set(calendar.dates.map((date) => date.publishDate)), [calendar.dates])
  const archive: ArchiveCalendarData = {
    availableDates,
    currentDate: current.publishDate,
    earliestMonth,
    latestMonth,
    selectionStatus: pending ? { date: dateFromKey(pending.key), state: pending.state } : null,
    onRetrySelection: pending ? () => selectKey(pending.key) : undefined,
    onShowCurrent: () => selectKey(current.publishDate),
  }

  const layoutProps = {
    view,
    onViewChange: handleViewChange,
    layout: entry.layout,
    date: selectedDate,
    isCurrentPuzzle,
    onLogoClick: () => handleViewChange('puzzle'),
    settingsActive: settingsOpen,
    onSettingsClick: () => setSettingsOpen(true),
    onSelectDate: handleSelectDate,
    getDateStarCount,
    archive,
  }

  return (
    <div className="app">
      <div className="app__content" inert={settingsOpen || undefined}>
        <PuzzleSessionProvider
          key={`${dateKey}-${resetGeneration}`}
          puzzle={entry.puzzle}
          sessionKey={dateKey}
          cache={sessionCache}
          allowRestoringResult={resetGeneration === 0}
        >
          {(interaction) =>
            isMobile ? (
              <MobileLayout
                {...layoutProps}
                activeCellId={interaction.activeCellId}
                activeDirection={interaction.activeDirection}
                onActiveCellChange={interaction.onActiveCellChange}
                onActiveDirectionChange={interaction.onActiveDirectionChange}
              />
            ) : (
              <DesktopLayout
                {...layoutProps}
                activeCellId={interaction.activeCellId}
                activeDirection={interaction.activeDirection}
                onActiveCellChange={interaction.onActiveCellChange}
                onActiveDirectionChange={interaction.onActiveDirectionChange}
              />
            )
          }
        </PuzzleSessionProvider>
      </div>
      {settingsOpen && (
        <NavDrawer
          reduceMotion={reduceMotion}
          onReduceMotionChange={setReduceMotion}
          onClose={() => setSettingsOpen(false)}
          onResetTestState={TEST_TOOLS_ENABLED && testTools ? handleResetTestState : undefined}
        />
      )}
    </div>
  )
}

export default App
