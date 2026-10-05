import { useState } from 'react'
import {
  WEEKDAYS,
  buildMonthGrid,
  formatFullDate,
  formatMonthYear,
  isSameDate,
  startOfMonth,
  toDateKey,
} from '../../core/archiveCalendar'
import { ArchiveCalendarKey } from './ArchiveCalendarKey'
import { Button } from './Button'
import { ArchiveDateButton } from './ArchiveDateButton'
import { ArchiveMonthSelector } from './ArchiveMonthSelector'
import './ArchiveCalendar.scss'

/** A pending Archive selection whose puzzle is still loading or failed to load. */
export interface ArchiveSelectionStatus {
  date: Date
  state: 'loading' | 'unavailable' | 'error'
}

// The released calendar, from the server — never the browser clock.
export interface ArchiveCalendarData {
  /** Released publish dates (YYYY-MM-DD); everything else is unavailable. */
  availableDates: ReadonlySet<string>
  /** The server's current publish date, which may be tomorrow's civil date. */
  currentDate: string
  earliestMonth: Date
  latestMonth: Date
  selectionStatus?: ArchiveSelectionStatus | null
  onRetrySelection?: () => void
  onShowCurrent?: () => void
}

export interface ArchiveCalendarProps extends ArchiveCalendarData {
  initialMonth: Date
  activeDate: Date
  onSelectDate: (date: Date) => void
  // Undefined means "not completed" — distinct from a real 0-star result,
  // which is what lets a genuinely completed 0-star puzzle look different
  // from an unplayed date's placeholder stars (spec section 15).
  getDateStarCount?: (date: Date) => 0 | 1 | 2 | 3 | undefined
}

function defaultGetDateStarCount(): undefined {
  return undefined
}

export function ArchiveCalendar({
  initialMonth,
  activeDate,
  onSelectDate,
  getDateStarCount = defaultGetDateStarCount,
  availableDates,
  currentDate,
  earliestMonth,
  latestMonth,
  selectionStatus,
  onRetrySelection,
  onShowCurrent,
}: ArchiveCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth))

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const grid = buildMonthGrid(year, monthIndex)
  const monthLabel = formatMonthYear(month)

  return (
    <div className="archive-calendar">
      <ArchiveMonthSelector
        month={month}
        earliestMonth={earliestMonth}
        latestMonth={latestMonth}
        onChange={setMonth}
      />
      <div
        className="archive-calendar__body"
        role="group"
        aria-label={`Puzzle calendar for ${monthLabel}`}
        // Lets MobileArchiveView focus this group programmatically on view
        // entry (its own existing aria-label already gives a screen reader
        // useful context) — tabIndex={-1} keeps it out of the normal Tab
        // order, so this is never reachable via a real keyboard Tab.
        tabIndex={-1}
      >
        <div className="archive-calendar__weekdays">
          {WEEKDAYS.map(({ short, full }, index) => (
            <div className="archive-calendar__weekday" key={`${full}-${index}`}>
              <span aria-hidden="true">{short}</span>
              <span className="archive-calendar__visually-hidden">{full}</span>
            </div>
          ))}
        </div>
        <div className="archive-calendar__dates">
          {grid.map((day, index) =>
            day === null ? (
              <div className="archive-calendar__blank" key={`blank-${index}`} aria-hidden="true" />
            ) : (
              <ArchiveDateButtonCell
                key={day}
                year={year}
                monthIndex={monthIndex}
                day={day}
                availableDates={availableDates}
                currentDate={currentDate}
                activeDate={activeDate}
                getDateStarCount={getDateStarCount}
                onSelectDate={onSelectDate}
              />
            ),
          )}
        </div>
      </div>
      {selectionStatus && (
        <SelectionStatusMessage
          status={selectionStatus}
          onRetry={onRetrySelection}
          onShowCurrent={onShowCurrent}
        />
      )}
      <ArchiveCalendarKey />
    </div>
  )
}

// Loading/failure feedback for an archived puzzle being opened. The puzzle
// already on screen stays in place until the new one has loaded.
function SelectionStatusMessage({
  status,
  onRetry,
  onShowCurrent,
}: {
  status: ArchiveSelectionStatus
  onRetry?: () => void
  onShowCurrent?: () => void
}) {
  const fullDate = formatFullDate(status.date)
  return (
    <div className="archive-calendar__status" role={status.state === 'loading' ? 'status' : 'alert'}>
      <p className="archive-calendar__status-message">
        {status.state === 'loading'
          ? `Loading the puzzle for ${fullDate}…`
          : status.state === 'unavailable'
            ? `The puzzle for ${fullDate} isn’t available.`
            : `The puzzle for ${fullDate} couldn’t be loaded.`}
      </p>
      {status.state !== 'loading' && (
        <div className="archive-calendar__status-actions">
          {status.state === 'error' && onRetry && <Button onClick={onRetry}>Retry</Button>}
          {onShowCurrent && (
            <Button variant="text" onClick={onShowCurrent}>
              Go to Today’s Puzzle
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

interface ArchiveDateButtonCellProps {
  year: number
  monthIndex: number
  day: number
  availableDates: ReadonlySet<string>
  currentDate: string
  activeDate: Date
  getDateStarCount: (date: Date) => 0 | 1 | 2 | 3 | undefined
  onSelectDate: (date: Date) => void
}

function ArchiveDateButtonCell({
  year,
  monthIndex,
  day,
  availableDates,
  currentDate,
  activeDate,
  getDateStarCount,
  onSelectDate,
}: ArchiveDateButtonCellProps) {
  const date = new Date(year, monthIndex, day)
  const dateKey = toDateKey(date)
  const available = availableDates.has(dateKey)
  const active = available && isSameDate(date, activeDate)
  const resultStarCount = available ? getDateStarCount(date) : undefined
  const completed = available && !active && resultStarCount !== undefined
  const fullDate = formatFullDate(date)
  // Relative to the server's current puzzle, not the browser's clock.
  const isFuture = dateKey > currentDate

  const ariaLabel = available
    ? `Open puzzle for ${fullDate}`
    : isFuture
      ? `${fullDate}, puzzle not yet available`
      : `${fullDate}, no puzzle available`

  const status = active ? 'active' : completed ? 'completed' : 'default'

  return (
    <ArchiveDateButton
      day={day}
      status={status}
      available={available}
      // Real earned rating for a completed date; a placeholder 0 (rendered
      // as muted or very-subtle outline stars depending on `status`/
      // `available`, not as a real result) everywhere else.
      starCount={resultStarCount ?? 0}
      ariaLabel={ariaLabel}
      onSelect={() => onSelectDate(date)}
    />
  )
}
