import { useState } from 'react'
import {
  WEEKDAYS,
  buildMonthGrid,
  formatFullDate,
  formatMonthYear,
  isSameDate,
  startOfMonth,
} from '../../core/archiveCalendar'
import { getEarliestArchiveMonth, getToday, isDateAvailable } from '../../data/archivePuzzles'
import { ArchiveCalendarKey } from './ArchiveCalendarKey'
import { ArchiveDateButton } from './ArchiveDateButton'
import { ArchiveMonthSelector } from './ArchiveMonthSelector'
import './ArchiveCalendar.scss'

export interface ArchiveCalendarProps {
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
}: ArchiveCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth))
  const today = getToday()
  const earliestMonth = getEarliestArchiveMonth()
  const latestMonth = startOfMonth(today)

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
                today={today}
                activeDate={activeDate}
                getDateStarCount={getDateStarCount}
                onSelectDate={onSelectDate}
              />
            ),
          )}
        </div>
      </div>
      <ArchiveCalendarKey />
    </div>
  )
}

interface ArchiveDateButtonCellProps {
  year: number
  monthIndex: number
  day: number
  today: Date
  activeDate: Date
  getDateStarCount: (date: Date) => 0 | 1 | 2 | 3 | undefined
  onSelectDate: (date: Date) => void
}

function ArchiveDateButtonCell({
  year,
  monthIndex,
  day,
  today,
  activeDate,
  getDateStarCount,
  onSelectDate,
}: ArchiveDateButtonCellProps) {
  const date = new Date(year, monthIndex, day)
  const available = isDateAvailable(date)
  const active = available && isSameDate(date, activeDate)
  const resultStarCount = available ? getDateStarCount(date) : undefined
  const completed = available && !active && resultStarCount !== undefined
  const fullDate = formatFullDate(date)
  const isFuture = date.getTime() > today.getTime()

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
