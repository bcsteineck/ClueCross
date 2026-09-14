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
  return (
    <div className="mobile-archive-view">
      <MobileBackBar onBack={onBack} />
      <div className="mobile-archive-view__calendar">
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
