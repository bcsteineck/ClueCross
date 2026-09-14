import { useRef, useState } from 'react'
import type { GameState } from './core/gameEngine'
import { toDateKey } from './core/archiveCalendar'
import { isDateCompleted } from './core/completionTracking'
import { getPuzzleResultStarCount } from './core/puzzleResults'
import { getArchiveEntryForDate, getToday } from './data/archivePuzzles'
import { dogsPuzzle } from './data/dogsPuzzle'
import { dogsPuzzleLayout } from './layout/dogsPuzzleLayout'
import { PuzzleSessionProvider } from './state/PuzzleSessionProvider'
import { useIsMobile } from './state/useIsMobile'
import { useReducedMotionPreference } from './state/useReducedMotionPreference'
import './App.scss'
import { DesktopLayout } from './ui/components/DesktopLayout'
import { MobileLayout } from './ui/components/MobileLayout'
import { NavDrawer } from './ui/components/NavDrawer'
import type { View } from './ui/view'

function App() {
  const isMobile = useIsMobile()
  const [view, setView] = useState<View>('puzzle')
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday())
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Per-date, not global: resetting one date's puzzle must not invalidate
  // the cached in-progress session of any other date.
  const [resetGenerations, setResetGenerations] = useState<Record<string, number>>({})
  const [reduceMotion, setReduceMotion] = useReducedMotionPreference()
  // Outlives the PuzzleSessionProvider remount boundary (below) so
  // switching Archive dates and back restores exact in-session progress —
  // see spec section 15 ("restores its existing saved state if previously
  // played"). Session-only: a full page reload still resets, matching
  // existing behavior for anything short of a completed puzzle.
  const sessionCache = useRef<Record<string, GameState>>({})

  const entry = getArchiveEntryForDate(selectedDate) ?? {
    puzzle: dogsPuzzle,
    layout: dogsPuzzleLayout,
  }
  const dateKey = toDateKey(selectedDate)
  const resetGeneration = resetGenerations[dateKey] ?? 0
  const isToday = dateKey === toDateKey(getToday())
  // There's no reason for a player to replay a puzzle they've already
  // completed — its archived result is permanent regardless (see
  // completionTracking.ts/puzzleResults.ts) — so NavDrawer disables the
  // reset control once this is true. Recomputed fresh on every render
  // (including the one triggered by opening Settings), so it reflects a
  // completion that just happened in this same session.
  const currentPuzzleCompleted = isDateCompleted(dateKey, entry.puzzle.id)

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    setView('puzzle')
  }

  function handleResetCurrentPuzzle() {
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
    const dateEntry = getArchiveEntryForDate(date)
    if (!dateEntry) return undefined
    return getPuzzleResultStarCount(toDateKey(date), dateEntry.puzzle.id)
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
                view={view}
                onViewChange={setView}
                layout={entry.layout}
                date={selectedDate}
                isToday={isToday}
                activeCellId={interaction.activeCellId}
                activeDirection={interaction.activeDirection}
                onActiveCellChange={interaction.onActiveCellChange}
                onActiveDirectionChange={interaction.onActiveDirectionChange}
                onLogoClick={() => setView('puzzle')}
                settingsActive={settingsOpen}
                onSettingsClick={() => setSettingsOpen(true)}
                onSelectDate={handleSelectDate}
                getDateStarCount={getDateStarCount}
              />
            ) : (
              <DesktopLayout
                view={view}
                onViewChange={setView}
                layout={entry.layout}
                date={selectedDate}
                isToday={isToday}
                activeCellId={interaction.activeCellId}
                activeDirection={interaction.activeDirection}
                onActiveCellChange={interaction.onActiveCellChange}
                onActiveDirectionChange={interaction.onActiveDirectionChange}
                onLogoClick={() => setView('puzzle')}
                settingsActive={settingsOpen}
                onSettingsClick={() => setSettingsOpen(true)}
                onSelectDate={handleSelectDate}
                getDateStarCount={getDateStarCount}
              />
            )
          }
        </PuzzleSessionProvider>
      </div>
      {settingsOpen && (
        <NavDrawer
          reduceMotion={reduceMotion}
          onReduceMotionChange={setReduceMotion}
          onResetCurrentPuzzle={handleResetCurrentPuzzle}
          currentPuzzleCompleted={currentPuzzleCompleted}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

export default App
