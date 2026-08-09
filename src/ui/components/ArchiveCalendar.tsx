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
  isDateCompleted?: (date: Date) => boolean
}

// Completion isn't tracked anywhere yet (no accounts/persistence), so the
// default always reports "not completed" — callers can pass a real
// predicate once that data exists.
function defaultIsDateCompleted(): boolean {
  return false
}

export function ArchiveCalendar({
  initialMonth,
  activeDate,
  onSelectDate,
  isDateCompleted = defaultIsDateCompleted,
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
                isDateCompleted={isDateCompleted}
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
  isDateCompleted: (date: Date) => boolean
  onSelectDate: (date: Date) => void
}

function ArchiveDateButtonCell({
  year,
  monthIndex,
  day,
  today,
  activeDate,
  isDateCompleted,
  onSelectDate,
}: ArchiveDateButtonCellProps) {
  const date = new Date(year, monthIndex, day)
  const available = isDateAvailable(date)
  const active = available && isSameDate(date, activeDate)
  const completed = available && !active && isDateCompleted(date)
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
      ariaLabel={ariaLabel}
      onSelect={() => onSelectDate(date)}
    />
  )
}
