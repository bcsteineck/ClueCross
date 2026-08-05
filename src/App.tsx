import { useState } from 'react'
import { toDateKey } from './core/archiveCalendar'
import { isDateCompleted } from './core/completionTracking'
import { getArchiveEntryForDate, getToday } from './data/archivePuzzles'
import { dogsPuzzle } from './data/dogsPuzzle'
import { dogsPuzzleLayout } from './layout/dogsPuzzleLayout'
import { useReducedMotionPreference } from './state/useReducedMotionPreference'
import './App.scss'
import { ArchiveCalendar } from './ui/components/ArchiveCalendar'
import { Header } from './ui/components/Header'
import { PuzzlePage } from './ui/components/PuzzlePage'
import { SettingsModal } from './ui/components/SettingsModal'

type View = 'puzzle' | 'archive'

function App() {
  const [view, setView] = useState<View>('puzzle')
  const [selectedDate, setSelectedDate] = useState<Date>(() => getToday())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [resetNonce, setResetNonce] = useState(0)
  const [reduceMotion, setReduceMotion] = useReducedMotionPreference()

  const entry = getArchiveEntryForDate(selectedDate) ?? {
    puzzle: dogsPuzzle,
    layout: dogsPuzzleLayout,
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date)
    setView('puzzle')
  }

  function handleResetCurrentPuzzle() {
    setResetNonce((n) => n + 1)
  }

  return (
    <div className="app">
      <div className="app__content" inert={settingsOpen || undefined}>
        <Header
          archiveActive={view === 'archive'}
          onArchiveClick={() => setView('archive')}
          settingsActive={settingsOpen}
          onSettingsClick={() => setSettingsOpen(true)}
        />
        {view === 'archive' ? (
          <ArchiveCalendar
            initialMonth={selectedDate}
            activeDate={selectedDate}
            onSelectDate={handleSelectDate}
            isDateCompleted={(date) => isDateCompleted(toDateKey(date))}
          />
        ) : (
          <PuzzlePage
            key={`${toDateKey(selectedDate)}-${resetNonce}`}
            puzzle={entry.puzzle}
            layout={entry.layout}
            date={selectedDate}
          />
        )}
      </div>
      {settingsOpen && (
        <SettingsModal
          reduceMotion={reduceMotion}
          onReduceMotionChange={setReduceMotion}
          onResetCurrentPuzzle={handleResetCurrentPuzzle}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

export default App
