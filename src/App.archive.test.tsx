// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { buildMonthGrid, getDaysInMonth, getLeadingBlankCount } from './core/archiveCalendar'
import { dogsPuzzle } from './data/dogsPuzzle'
import { ArchiveCalendar } from './ui/components/ArchiveCalendar'

// A fixed "today" decouples these tests from the real wall-clock date, and
// is deliberately chosen so that some fixture offsets (7, 14 days back)
// land in the previous month — needed to exercise cross-month behavior
// (changing month, reopening Archive on an archived puzzle's month).
vi.mock('./data/archivePuzzles', async () => {
  const { dogsPuzzle } = await import('./data/dogsPuzzle')
  const { dogsPuzzleLayout } = await import('./layout/dogsPuzzleLayout')
  const { addMonths, startOfDay, startOfMonth, toDateKey } = await import('./core/archiveCalendar')

  const today = startOfDay(new Date(2026, 7, 5)) // August 5, 2026
  const offsets = [0, 1, 2, 7, 14]
  const entries: Record<string, { puzzle: typeof dogsPuzzle; layout: typeof dogsPuzzleLayout }> = {}
  for (const offset of offsets) {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    entries[toDateKey(date)] = { puzzle: dogsPuzzle, layout: dogsPuzzleLayout }
  }

  return {
    getToday: () => today,
    getArchiveEntryForDate: (date: Date) => entries[toDateKey(date)],
    isDateAvailable: (date: Date) => {
      if (startOfDay(date).getTime() > today.getTime()) return false
      return entries[toDateKey(date)] !== undefined
    },
    // Spans two years (2025 and 2026) so a year-only change is testable.
    getEarliestArchiveMonth: () => addMonths(startOfMonth(today), -14),
  }
})

afterEach(cleanup)

async function openArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^archive$/i }))
}

async function changeMonth(
  user: ReturnType<typeof userEvent.setup>,
  triggerLabel: string,
  monthName: string,
) {
  await user.click(screen.getByRole('button', { name: new RegExp(triggerLabel, 'i') }))
  await user.selectOptions(screen.getByLabelText('Month'), monthName)
}

describe('Archive', () => {
  it('clicking Archive shows the calendar in the center column, leaving the clue card visible', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByRole('heading', { name: /today's clue/i })).toBeTruthy()

    await openArchive(user)

    // Desktop's left column (Clue/Score/Progress) stays visible regardless
    // of view — only the center column's content changes (spec section 5).
    expect(screen.getByRole('heading', { name: /today's clue/i })).toBeTruthy()
    expect(screen.getByRole('group', { name: /puzzle calendar for august 2026/i })).toBeTruthy()
  })

  it('clicking Archive again while already viewing it returns to the puzzle', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArchive(user)
    expect(screen.getByRole('group', { name: /puzzle calendar for august 2026/i })).toBeTruthy()

    await openArchive(user)

    expect(screen.getByRole('heading', { name: /today's clue/i })).toBeTruthy()
    expect(screen.queryByRole('group', { name: /puzzle calendar/i })).toBeNull()
  })

  it('clicking the ClueCross logo returns to the puzzle from the archive', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArchive(user)
    expect(screen.getByRole('group', { name: /puzzle calendar for august 2026/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /cluecross/i }))

    expect(screen.getByRole('heading', { name: /today's clue/i })).toBeTruthy()
    expect(screen.queryByRole('group', { name: /puzzle calendar/i })).toBeNull()
  })

  it('shows the current month initially', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArchive(user)
    expect(screen.getByRole('button', { name: /august 2026/i })).toBeTruthy()
  })

  it('weekday headings start with Sunday', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await openArchive(user)

    const weekdayEls = container.querySelectorAll('.archive-calendar__weekday')
    const fullNames = Array.from(weekdayEls).map(
      (el) => el.querySelector('.archive-calendar__visually-hidden')?.textContent,
    )
    expect(fullNames).toEqual([
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
    ])
    const shortLabels = Array.from(weekdayEls).map((el) => el.textContent?.trim()[0])
    expect(shortLabels.join(' ')).toBe('S M T W T F S')
  })

  it('aligns dates under the correct weekdays', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await openArchive(user)

    const leadingBlanks = getLeadingBlankCount(2026, 7) // August 2026
    const daysInMonth = getDaysInMonth(2026, 7)
    const dateGrid = container.querySelector('.archive-calendar__dates')
    const cells = Array.from(dateGrid?.children ?? [])

    expect(cells).toHaveLength(leadingBlanks + daysInMonth)
    expect(cells.slice(0, leadingBlanks).every((el) => el.classList.contains('archive-calendar__blank'))).toBe(true)
    expect(cells[leadingBlanks].textContent).toContain('1')
    expect(cells.at(-1)?.textContent).toContain(String(daysInMonth))
  })

  it('changing the month updates the calendar immediately without closing the panel, and there is no Apply button', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await openArchive(user)
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull()

    await changeMonth(user, 'august 2026', 'September')

    expect(screen.getByRole('button', { name: /september 2026/i })).toBeTruthy()
    expect(screen.getByLabelText('Month')).toBeTruthy() // panel stays open
    const expectedGrid = buildMonthGrid(2026, 8) // September
    const dateGrid = container.querySelector('.archive-calendar__dates')
    expect(dateGrid?.children).toHaveLength(expectedGrid.length)
  })

  it('changing only the year immediately applies without closing the panel', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArchive(user)

    await user.click(screen.getByRole('button', { name: /august 2026/i }))
    await user.selectOptions(screen.getByLabelText('Year'), '2025')

    expect(screen.getByRole('button', { name: /august 2025/i })).toBeTruthy()
    expect(screen.getByLabelText('Year')).toBeTruthy() // panel stays open
  })

  it('only closes the month/year panel when the trigger is clicked again, not on selection', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArchive(user)

    await changeMonth(user, 'august 2026', 'September')
    expect(screen.getByLabelText('Month')).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Year'), '2025')
    expect(screen.getByLabelText('Year')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /september 2025/i }))

    expect(screen.queryByLabelText('Month')).toBeNull()
    expect(screen.queryByLabelText('Year')).toBeNull()
  })

  it('clicking an available date opens its puzzle', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArchive(user)

    await user.click(screen.getByRole('button', { name: /open puzzle for august 5, 2026/i }))

    expect(screen.getByRole('heading', { name: /today's clue\s*dogs/i })).toBeTruthy()
    expect(screen.queryByRole('group', { name: /puzzle calendar/i })).toBeNull()
  })

  it('clicking or activating an unavailable date does nothing', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArchive(user)

    // August 10, 2026 has no fixture entry (only 3, 4, 5 are available in August).
    const unavailable = screen.getByRole('button', { name: /august 10, 2026/i })
    expect(unavailable).toHaveProperty('disabled', true)

    await user.click(unavailable)

    expect(screen.getByRole('group', { name: /puzzle calendar for august 2026/i })).toBeTruthy()
  })

  it('applies a completed state via aria-label (including the real star count) and styling', () => {
    render(
      <ArchiveCalendar
        initialMonth={new Date(2026, 7, 5)}
        activeDate={new Date(2026, 0, 1)} // unrelated date, so it never wins over "completed"
        onSelectDate={() => {}}
        getDateStarCount={(date) => (date.getDate() === 5 ? 2 : undefined)}
      />,
    )

    const completedButton = screen.getByRole('button', {
      name: /august 5, 2026 \(completed, 2 out of 3 stars\)/i,
    })
    expect(completedButton.className).toContain('archive-date--completed')

    const plainButton = screen.getByRole('button', { name: /open puzzle for august 4, 2026/i })
    expect(plainButton.className).not.toContain('archive-date--completed')
  })

  it('distinguishes a real 0-star completed result from an unplayed date', () => {
    render(
      <ArchiveCalendar
        initialMonth={new Date(2026, 7, 5)}
        activeDate={new Date(2026, 0, 1)}
        onSelectDate={() => {}}
        getDateStarCount={(date) => (date.getDate() === 5 ? 0 : undefined)}
      />,
    )

    // A genuine 0-star result is still "(completed, ...)", distinct from an
    // unplayed date's plain "Open puzzle for ..." label.
    const zeroStarButton = screen.getByRole('button', {
      name: /august 5, 2026 \(completed, 0 out of 3 stars\)/i,
    })
    expect(zeroStarButton.className).toContain('archive-date--completed')

    const unplayedButton = screen.getByRole('button', { name: /open puzzle for august 4, 2026/i })
    expect(unplayedButton.className).not.toContain('archive-date--completed')
  })

  it('marks the currently viewed puzzle\'s date as active, taking priority over completed', () => {
    render(
      <ArchiveCalendar
        initialMonth={new Date(2026, 7, 5)}
        activeDate={new Date(2026, 7, 5)}
        onSelectDate={() => {}}
        getDateStarCount={(date) => (date.getDate() === 5 ? 2 : undefined)}
      />,
    )

    const activeButton = screen.getByRole('button', {
      name: /august 5, 2026 \(currently viewing\)/i,
    })
    expect(activeButton.className).toContain('archive-date--active')
    expect(activeButton.className).not.toContain('archive-date--completed')
    expect(activeButton.getAttribute('aria-current')).toBe('date')
  })

  it('shows the Archive trigger as active only while the calendar is open', async () => {
    const user = userEvent.setup()
    render(<App />)

    const archiveButton = screen.getByRole('button', { name: /^archive$/i })
    expect(archiveButton.getAttribute('aria-pressed')).toBe('false')
    expect(archiveButton.className).not.toContain('button--active')

    await openArchive(user)

    expect(archiveButton.getAttribute('aria-pressed')).toBe('true')
    expect(archiveButton.className).toContain('button--active')
  })

  it('reopening Archive from an archived puzzle defaults to that puzzle\'s month', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openArchive(user)

    // July 22, 2026 is 14 days before the fixed "today" (Aug 5) and falls
    // in the previous month.
    await changeMonth(user, 'august 2026', 'July')
    await user.click(screen.getByRole('button', { name: /open puzzle for july 22, 2026/i }))
    // July 22 isn't "today" (mocked as August 5), so the clue card shows
    // its publication date instead of "Today's Clue" (spec section 15).
    expect(screen.getByRole('heading', { name: /july 22, 2026\s*dogs/i })).toBeTruthy()

    await openArchive(user)

    expect(screen.getByRole('button', { name: /july 2026/i })).toBeTruthy()
  })

  it('restores in-progress state when returning to a previously viewed puzzle via Archive', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByTestId('cell-r0c0'))
    await user.keyboard('S')
    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('S')

    // Switch to a different available date (a separate, never-played
    // session) and back to the original date via Archive.
    await openArchive(user)
    await user.click(screen.getByRole('button', { name: /open puzzle for august 4, 2026/i }))
    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('')

    await openArchive(user)
    await user.click(screen.getByRole('button', { name: /open puzzle for august 5, 2026/i }))

    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('S')
  })

  it('does not restore a reset puzzle\'s pre-reset progress after switching dates and back', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByTestId('cell-r0c0'))
    await user.keyboard('S')
    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('S')

    await user.click(screen.getByRole('button', { name: /^settings$/i }))
    await user.click(screen.getByRole('button', { name: /reset current puzzle/i }))
    await user.click(screen.getByRole('button', { name: /^reset$/i }))
    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('')

    // Switching away and back after a reset must not resurrect the
    // pre-reset progress that was cached under the old session key.
    await openArchive(user)
    await user.click(screen.getByRole('button', { name: /open puzzle for august 4, 2026/i }))
    await openArchive(user)
    await user.click(screen.getByRole('button', { name: /open puzzle for august 5, 2026/i }))
    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('')
  })

  it('supports full keyboard operation of the Archive controls', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.tab() // -> ClueCross logo (first focusable element)
    await user.tab() // -> Archive button (desktop header has no How-to-Play trigger)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^archive$/i }))
    await user.keyboard('{Enter}')
    expect(screen.getByRole('group', { name: /puzzle calendar for august 2026/i })).toBeTruthy()

    const monthTrigger = screen.getByRole('button', { name: /august 2026/i })
    monthTrigger.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Month')).toBeTruthy()

    const availableDate = screen.getByRole('button', { name: /open puzzle for august 5, 2026/i })
    availableDate.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByRole('heading', { name: /today's clue\s*dogs/i })).toBeTruthy()
  })
})

// This file's other tests don't stub localStorage, so completion/result
// persistence silently no-ops for them (caught by that code's own
// try/catch) — fine, since none of them depend on it. These do, so they
// get their own scoped stub instead of adding one file-wide.
describe('Completed archived puzzle restoration', () => {
  function createMemoryStorage(): Storage {
    const store = new Map<string, string>()
    return {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, String(value))
      },
      removeItem: (key) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
      key: (index) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size
      },
    }
  }

  function getCell(cellId: string): HTMLInputElement {
    return screen.getByTestId(`cell-${cellId}`) as HTMLInputElement
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restores a completed archived puzzle\'s board and score after a full remount', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    for (const cell of Object.values(dogsPuzzle.cells)) {
      await user.click(getCell(cell.id))
      await user.keyboard(cell.correctLetter)
    }
    expect(screen.getByRole('dialog', { name: /puzzle complete/i })).toBeTruthy()
    // A full unmount+remount discards in-memory state (the session cache
    // and React state alike) — only what's actually persisted survives,
    // which is exactly what this test needs to exercise (spec section 12:
    // "revisiting the completed puzzle restores its completed state").
    unmount()

    render(<App />)

    for (const cell of Object.values(dogsPuzzle.cells)) {
      expect(getCell(cell.id).value).toBe(cell.correctLetter)
      expect(getCell(cell.id).readOnly).toBe(true)
    }
    expect(screen.getByTestId('score-badge').textContent).toContain('2000')
  })
})
