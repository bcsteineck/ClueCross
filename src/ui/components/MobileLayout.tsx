import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { CellId } from '../../core/types'
import type { Direction } from '../../layout/entryDirection'
import { getGridDimensions } from '../../layout/gridDimensions'
import type { LayoutDefinition } from '../../layout/types'
import type { View } from '../view'
import './MobileLayout.scss'
import { MobileArchiveView } from './MobileArchiveView'
import { MobileHeader } from './MobileHeader'
import { MobileHowToPlayView } from './MobileHowToPlayView'
import { MobilePuzzleView } from './MobilePuzzleView'
import { MobileRevealView } from './MobileRevealView'
import { MobileStatsView } from './MobileStatsView'

export interface MobileLayoutProps {
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

// The mobile composition (spec section 6) — a focused single-task game
// interface with secondary information available on demand, not the
// desktop dashboard stacked into one column. The persistent header (logo,
// Info, Settings, Archive) remains visible across all five primary views;
// Stats, Archive, and How to Play additionally show their own "Back to
// Puzzle" bar within the content area, since none of the header's icons is
// itself a way back to the puzzle from there.
export function MobileLayout({
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
}: MobileLayoutProps) {
  // Exposed as custom properties on the root element (below) rather than
  // just inside MobilePuzzleView, so MobileRevealView can size its own
  // letter-selector footprint to match the puzzle board's shape too — it
  // never renders an actual PuzzleBoard, so it has no other way to read
  // these (see MobilePuzzleView.scss/MobileRevealView.scss).
  const { cols, rows } = useMemo(() => getGridDimensions(layout), [layout])

  // Dismisses the native keyboard when leaving Puzzle for any other view,
  // or opening Settings (spec section 16). Tapping a button elsewhere
  // already blurs the focused cell in most browsers, but this makes it
  // explicit and reliable rather than depending on that incidental effect.
  useEffect(() => {
    if (view !== 'puzzle' || settingsActive) {
      const active = document.activeElement
      if (active instanceof HTMLElement && active.classList.contains('cell')) {
        active.blur()
      }
    }
  }, [view, settingsActive])

  return (
    <div className="mobile-layout" style={{ '--cols': cols, '--rows': rows } as CSSProperties}>
      <MobileHeader
        onLogoClick={onLogoClick}
        onInfoClick={() => onViewChange('howToPlay')}
        onSettingsClick={onSettingsClick}
        onArchiveClick={() => onViewChange('archive')}
        settingsActive={settingsActive}
      />

      {view === 'puzzle' && (
        <MobilePuzzleView
          layout={layout}
          date={date}
          isToday={isToday}
          activeCellId={activeCellId}
          activeDirection={activeDirection}
          onActiveCellChange={onActiveCellChange}
          onActiveDirectionChange={onActiveDirectionChange}
          onStatsClick={() => onViewChange('stats')}
          onRevealClick={() => onViewChange('reveal')}
        />
      )}

      {view === 'reveal' && (
        <MobileRevealView
          date={date}
          isToday={isToday}
          onStatsClick={() => onViewChange('stats')}
          onRevealed={() => onViewChange('puzzle')}
          onCancel={() => onViewChange('puzzle')}
        />
      )}

      {view === 'stats' && <MobileStatsView onBack={() => onViewChange('puzzle')} />}

      {view === 'archive' && (
        <MobileArchiveView
          date={date}
          onBack={() => onViewChange('puzzle')}
          onSelectDate={onSelectDate}
          getDateStarCount={getDateStarCount}
        />
      )}

      {view === 'howToPlay' && <MobileHowToPlayView onBack={() => onViewChange('puzzle')} />}
    </div>
  )
}
