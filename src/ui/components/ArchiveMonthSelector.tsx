import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { formatMonthYear } from '../../core/archiveCalendar'
import { SelectField } from './SelectField'
import './ArchiveMonthSelector.scss'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export interface ArchiveMonthSelectorProps {
  month: Date
  earliestMonth: Date
  latestMonth: Date
  onChange: (month: Date) => void
}

export function ArchiveMonthSelector({
  month,
  earliestMonth,
  latestMonth,
  onChange,
}: ArchiveMonthSelectorProps) {
  const [open, setOpen] = useState(false)
  const [pendingMonth, setPendingMonth] = useState(month.getMonth())
  const [pendingYear, setPendingYear] = useState(month.getFullYear())
  const panelId = useId()

  const years: number[] = []
  for (let y = earliestMonth.getFullYear(); y <= latestMonth.getFullYear(); y++) {
    years.push(y)
  }

  function handleToggle() {
    if (!open) {
      setPendingMonth(month.getMonth())
      setPendingYear(month.getFullYear())
    }
    setOpen(!open)
  }

  function handleMonthChange(newMonth: number) {
    setPendingMonth(newMonth)
    onChange(new Date(pendingYear, newMonth, 1))
  }

  function handleYearChange(newYear: number) {
    setPendingYear(newYear)
    onChange(new Date(newYear, pendingMonth, 1))
  }

  return (
    <div className="archive-month-selector">
      <button
        type="button"
        className="archive-month-selector__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={handleToggle}
      >
        {formatMonthYear(month)}
        <ChevronDown
          size={20}
          className="archive-month-selector__chevron"
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={panelId} className="archive-month-selector__panel">
          <SelectField
            label="Month"
            hideLabel
            value={pendingMonth}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
          >
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Year"
            hideLabel
            value={pendingYear}
            onChange={(e) => handleYearChange(Number(e.target.value))}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </SelectField>
        </div>
      )}
    </div>
  )
}
