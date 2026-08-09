import { useState } from 'react'
import { toDateKey } from './core/archiveCalendar'
import { isDateCompleted } from './core/completionTracking'
import { hasCompletedOnboarding, markOnboardingCompleted } from './core/onboardingCompletion'
import { getArchiveEntryForDate, getToday } from './data/archivePuzzles'
import { dogsPuzzle } from './data/dogsPuzzle'
import { dogsPuzzleLayout } from './layout/dogsPuzzleLayout'
import { useReducedMotionPreference } from './state/useReducedMotionPreference'
import './App.scss'
import { ArchiveCalendar } from './ui/components/ArchiveCalendar'
import { Header } from './ui/components/Header'
import type { NavDrawerView } from './ui/components/NavDrawer'
import { NavDrawer } from './ui/components/NavDrawer'
import { Onboarding } from './ui/components/Onboarding'
import { PuzzlePage } from './ui/components/PuzzlePage'

type View = 'puzzle' | 'archive'

function App() {
  const [view, setView] = useState<View>('puzzle')
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday())
  const [drawer, setDrawer] = useState<NavDrawerView | null>(null)
  const [resetNonce, setResetNonce] = useState(0)
  const [reduceMotion, setReduceMotion] = useReducedMotionPreference()
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding())

  const entry = getArchiveEntryForDate(selectedDate) ?? {
    puzzle: dogsPuzzle,
    layout: dogsPuzzleLayout,
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    setView('puzzle')
  }

  // Archive doubles as a toggle: clicking it again while already viewing
  // the archive returns to the puzzle, since selecting a date is otherwise
  // the only way back.
  function handleArchiveClick() {
    setView((current) => (current === 'archive' ? 'puzzle' : 'archive'))
  }

  function handleResetCurrentPuzzle() {
    setResetNonce((n) => n + 1)
  }

  // Shared by Skip and Start Playing — either way, the player has seen
  // onboarding and lands back on the puzzle they already had loaded.
  function handleOnboardingClose() {
    markOnboardingCompleted()
    setShowOnboarding(false)
  }

  return (
    <div className="app">
      <div className="app__content" inert={drawer !== null || showOnboarding || undefined}>
        <Header
          onLogoClick={() => setView('puzzle')}
          onHowToPlayClick={() => setShowOnboarding(true)}
          archiveActive={view === 'archive'}
          onArchiveClick={handleArchiveClick}
          settingsActive={drawer === 'settings'}
          onSettingsClick={() => setDrawer('settings')}
          onMenuClick={() => setDrawer('menu')}
        />
        {view === 'archive' ? (
          <ArchiveCalendar
            initialMonth={selectedDate}
            activeDate={selectedDate}
            onSelectDate={handleSelectDate}
            isDateCompleted={(date) => {
              const dateEntry = getArchiveEntryForDate(date)
              return dateEntry !== undefined && isDateCompleted(toDateKey(date), dateEntry.puzzle.id)
            }}
          />
        ) : (
          <PuzzlePage
            key={`${toDateKey(selectedDate)}-${resetNonce}`}
            puzzle={entry.puzzle}
            layout={entry.layout}
            date={selectedDate}
          />
        )}
        <footer className="app__copyright">© {new Date().getFullYear()} ClueCross</footer>
      </div>
      {drawer && (
        <NavDrawer
          initialView={drawer}
          onHowToPlayClick={() => {
            setShowOnboarding(true)
            setDrawer(null)
          }}
          archiveActive={view === 'archive'}
          onArchiveClick={() => {
            handleArchiveClick()
            setDrawer(null)
          }}
          reduceMotion={reduceMotion}
          onReduceMotionChange={setReduceMotion}
          onResetCurrentPuzzle={handleResetCurrentPuzzle}
          onClose={() => setDrawer(null)}
        />
      )}
      {showOnboarding && <Onboarding onClose={handleOnboardingClose} />}
    </div>
  )
}

export default App
