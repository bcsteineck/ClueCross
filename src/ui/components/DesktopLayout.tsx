import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { isPuzzleComplete } from '../../core/gameEngine'
import { getFreeRevealsSublabel } from '../../core/letterCosts'
import { getProgress } from '../../core/progress'
import type { CellId } from '../../core/types'
import type { Direction } from '../../layout/entryDirection'
import { getGridDimensions } from '../../layout/gridDimensions'
import type { LayoutDefinition } from '../../layout/types'
import { usePuzzleSession } from '../../state/PuzzleSessionContext'
import type { View } from '../view'
import { ArchiveCalendar } from './ArchiveCalendar'
import { ClueCard } from './ClueCard'
import { ContainerCard } from './ContainerCard'
import './DesktopLayout.scss'
import { Header } from './Header'
import { HowItWorksCard } from './HowItWorksCard'
import { ProgressCard } from './ProgressCard'
import { PuzzleView } from './PuzzleView'
import { RevealButton } from './RevealButton'
import { RevealHistoryCard } from './RevealHistoryCard'
import { RevealLetterSelector } from './RevealLetterSelector'
import { ScoreCard } from './ScoreCard'

export interface DesktopLayoutProps {
  // Desktop only ever sets/reads 'puzzle' | 'reveal' | 'archive' — 'stats'
  // and 'howToPlay' (mobile-only) are treated the same as 'puzzle' below,
  // so a view carried over from mobile after a resize degrades safely.
  view: View
  onViewChange: (view: View) => void
  layout: LayoutDefinition
  date: Date
  isToday: boolean
  activeCellId: CellId | null
  activeDirection: Direction
  onActiveCellChange: (cellId: CellId) => void
  onActiveDirectionChange: (direction: Direction) => void
  onLogoClick: () => void
  settingsActive: boolean
  onSettingsClick: () => void
  onSelectDate: (date: Date) => void
  getDateStarCount: (date: Date) => 0 | 1 | 2 | 3 | undefined
}

// The desktop dashboard shell (spec section 5): a persistent header, a
// responsive 1:2:1 three-column layout, and a footer. Only the center
// column's content swaps with `view` — the left (Clue/Score/Progress) and
// right (Reveal action/History/How it works) columns stay visible
// regardless, per the Figma desktop frames (Reveal and Archive both show
// the identical right column).
export function DesktopLayout({
  view,
  onViewChange,
  layout,
  date,
  isToday,
  activeCellId,
  activeDirection,
  onActiveCellChange,
  onActiveDirectionChange,
  onLogoClick,
  settingsActive,
  onSettingsClick,
  onSelectDate,
  getDateStarCount,
}: DesktopLayoutProps) {
  const { state } = usePuzzleSession()
  const progress = getProgress(state)
  const complete = isPuzzleComplete(state)
  // Exposed as a custom property on the page root (below) so the center
  // card's Reveal state (see .desktop-layout__center-card--reveal) can
  // match the Puzzle board's own aspect ratio without needing an actual
  // PuzzleBoard mounted to read it from.
  const { cols, rows } = useMemo(() => getGridDimensions(layout), [layout])

  return (
    // .desktop-page is what makes the header/footer bars able to span the
    // full viewport width while still reaching the actual bottom edge when
    // the puzzle content alone is shorter than the viewport (a plain
    // Fragment can't carry the min-height/flex-column needed for that).
    <div className="desktop-page" style={{ '--cols': cols, '--rows': rows } as CSSProperties}>
      {/* Rendered outside .desktop-layout so it can span the full viewport
          width — its own inner wrapper re-applies the same max-width/
          centering the dashboard body uses, so the logo/nav still lines up
          with the columns below. */}
      <Header
        onLogoClick={onLogoClick}
        archiveActive={view === 'archive'}
        onArchiveClick={() => onViewChange(view === 'archive' ? 'puzzle' : 'archive')}
        settingsActive={settingsActive}
        onSettingsClick={onSettingsClick}
      />
      <div className="desktop-layout">
        <div className="desktop-layout__columns">
          <div className="desktop-layout__column desktop-layout__column--left">
            <ClueCard clue={state.puzzle.clue} isToday={isToday} date={date} />
            <ScoreCard score={state.score} unlockBudget={state.puzzle.unlockBudget} />
            <ProgressCard progress={progress} />
          </div>

          <div className="desktop-layout__column desktop-layout__column--center">
            <ContainerCard
              className={`desktop-layout__center-card${view === 'reveal' ? ' desktop-layout__center-card--reveal' : ''}`}
            >
              {view === 'archive' ? (
                <ArchiveCalendar
                  initialMonth={date}
                  activeDate={date}
                  onSelectDate={onSelectDate}
                  getDateStarCount={getDateStarCount}
                />
              ) : view === 'reveal' ? (
                <RevealLetterSelector onRevealed={() => onViewChange('puzzle')} />
              ) : (
                <PuzzleView
                  layout={layout}
                  activeCellId={activeCellId}
                  activeDirection={activeDirection}
                  onActiveCellChange={onActiveCellChange}
                  onActiveDirectionChange={onActiveDirectionChange}
                />
              )}
            </ContainerCard>
          </div>

          <div className="desktop-layout__column desktop-layout__column--right">
            {view === 'reveal' ? (
              <RevealButton
                variant="cancel"
                label="Cancel Reveal"
                sublabel={getFreeRevealsSublabel(state.freeRevealsRemaining)}
                onClick={() => onViewChange('puzzle')}
              />
            ) : (
              <RevealButton
                variant="default"
                label="Reveal Letter"
                sublabel={getFreeRevealsSublabel(state.freeRevealsRemaining)}
                disabled={complete}
                onClick={() => onViewChange('reveal')}
              />
            )}
            <RevealHistoryCard entries={state.revealHistory} />
            <HowItWorksCard />
          </div>
        </div>
      </div>

      {/* Same full-bleed treatment as the header, at the opposite edge —
          rendered outside .desktop-layout (which stops growing here) so it
          can span the full viewport width and reach the actual bottom
          edge. */}
      <footer className="desktop-layout__copyright">
        <div className="desktop-layout__copyright-inner">
          © {new Date().getFullYear()} ClueCross
        </div>
      </footer>
    </div>
  )
}
