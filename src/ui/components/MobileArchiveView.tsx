import { useEffect, useRef } from 'react'
import { ArchiveCalendar } from './ArchiveCalendar'
import './MobileArchiveView.scss'
import { MobileBackBar } from './MobileBackBar'

export interface MobileArchiveViewProps {
  date: Date
  onBack: () => void
  onSelectDate: (date: Date) => void
  getDateStarCount: (date: Date) => 0 | 1 | 2 | 3 | undefined
}

// Spec section 6/15: Back to Puzzle, month/year selection, the calendar,
// and an optional minimal footer. Sizes naturally vertically — no forced
// 1:1 aspect ratio here, unlike Puzzle/Reveal.
export function MobileArchiveView({
  date,
  onBack,
  onSelectDate,
  getDateStarCount,
}: MobileArchiveViewProps) {
  // Entering this view is a real navigation, so focus needs a logical
  // landing point (see MobileHowToPlayView for the full rationale). There's
  // no heading here, so this focuses ArchiveCalendar's own calendar group
  // instead — it already carries a descriptive aria-label ("Puzzle
  // calendar for <month>"), found via a container ref since ArchiveCalendar
  // doesn't expose a ref of its own.
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    containerRef.current?.querySelector<HTMLElement>('.archive-calendar__body')?.focus()
  }, [])

  return (
    <div className="mobile-archive-view">
      <MobileBackBar onBack={onBack} />
      <div className="mobile-archive-view__calendar" ref={containerRef}>
        <ArchiveCalendar
          initialMonth={date}
          activeDate={date}
          onSelectDate={onSelectDate}
          getDateStarCount={getDateStarCount}
        />
      </div>
      <footer className="mobile-archive-view__copyright">
        © {new Date().getFullYear()} ClueCross
      </footer>
    </div>
  )
}
