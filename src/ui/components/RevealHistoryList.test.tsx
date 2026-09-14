// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { RevealHistoryList } from './RevealHistoryList'
import type { RevealHistoryEntry } from '../../core/types'

afterEach(cleanup)

function makeEntries(count: number): RevealHistoryEntry[] {
  const letters = 'ABCDEFGH'.split('')
  return Array.from({ length: count }, (_, i) => ({
    letter: letters[i],
    cost: i === 0 ? 'Free' : (i + 1) * 10,
    cellsRevealed: i,
  }))
}

describe('RevealHistoryList', () => {
  it('shows a placeholder message when nothing has been revealed', () => {
    render(<RevealHistoryList entries={[]} />)
    expect(screen.getByText(/no letters revealed yet/i)).toBeTruthy()
  })

  it('renders letter, cost, and cell count for each entry', () => {
    render(
      <RevealHistoryList
        entries={[{ letter: 'A', cost: 'Free', cellsRevealed: 6 }]}
      />,
    )
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('Free')).toBeTruthy()
    expect(screen.getByText('6 cells')).toBeTruthy()
  })

  it('uses singular "cell" for exactly one cell revealed', () => {
    render(<RevealHistoryList entries={[{ letter: 'Q', cost: 30, cellsRevealed: 1 }]} />)
    expect(screen.getByText('1 cell')).toBeTruthy()
  })

  it('renders "0 cells" for a letter absent from the puzzle', () => {
    render(<RevealHistoryList entries={[{ letter: 'Q', cost: 'Free', cellsRevealed: 0 }]} />)
    expect(screen.getByText('0 cells')).toBeTruthy()
  })

  it('shows only the 3 most recent entries by default, with no toggle when there are 3 or fewer', () => {
    render(<RevealHistoryList entries={makeEntries(3)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /show all/i })).toBeNull()
  })

  it('shows a Show All control when there are more than 3 entries, expanding on click', async () => {
    const user = userEvent.setup()
    render(<RevealHistoryList entries={makeEntries(5)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: /show all/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByRole('button', { name: /show less/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /show less/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
