// Pure date/grid math for the Archive calendar — no React, no app state,
// so month-grid construction and formatting can be unit tested directly.

// Monday-first, matching the calendar's weekday row (M T W T F S S).
export const WEEKDAYS = [
  { short: 'M', full: 'Monday' },
  { short: 'T', full: 'Tuesday' },
  { short: 'W', full: 'Wednesday' },
  { short: 'T', full: 'Thursday' },
  { short: 'F', full: 'Friday' },
  { short: 'S', full: 'Saturday' },
  { short: 'S', full: 'Sunday' },
] as const

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

// JS Date.getDay() is Sunday-first (0-6); convert to a Monday-first offset
// (0=Monday .. 6=Sunday) to know how many leading blanks a month needs.
export function getLeadingBlankCount(year: number, month: number): number {
  const firstWeekday = new Date(year, month, 1).getDay()
  return (firstWeekday + 6) % 7
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// A flat, row-major (7 columns) list of cells for the month: `null` for
// leading blanks before day 1, otherwise the day-of-month number. No
// trailing blanks after the last day — the grid simply ends there.
export function buildMonthGrid(year: number, month: number): (number | null)[] {
  const leading = getLeadingBlankCount(year, month)
  const days = getDaysInMonth(year, month)
  const cells: (number | null)[] = new Array(leading).fill(null)
  for (let day = 1; day <= days; day++) {
    cells.push(day)
  }
  return cells
}

export function formatMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

export function formatFullDate(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}
