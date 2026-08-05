// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { dogsPuzzle } from './data/dogsPuzzle'
import { DEFAULT_REVEAL_BUDGET, getLetterCost } from './core/letterCosts'

afterEach(cleanup)

// Relevant Dogs-puzzle layout, for reference:
//   SHEPHERD across, row 0, cols 0-7:  r0c0=S r0c1=H r0c2=E r0c3=P
//                                       r0c4=H r0c5=E r0c6=R r0c7=D
//   POODLE down, col 3, rows 0-5:      r0c3=P r1c3=O r2c3=O r3c3=D r4c3=L r5c3=E
// Starting score is 2000. Every letter has a fixed cost from LETTER_COSTS
// regardless of how many times (or whether) it appears in this puzzle, and
// the score is a running total — reveals are never blocked by it, and it
// can go negative. 'H' appears 7 times (r0c1, r0c4, r7c2, r9c2, r12c2,
// r12c15, r13c1) — a real repeated letter, unlike the old sample puzzle.

function getCell(cellId: string): HTMLInputElement {
  return screen.getByTestId(`cell-${cellId}`) as HTMLInputElement
}

function getLetterButton(letter: string): HTMLButtonElement {
  return screen.getByTestId(`letter-${letter}`) as HTMLButtonElement
}

function getScoreBadge(): HTMLElement {
  return screen.getByTestId('score-badge')
}

function getScoreBadgeValue(): string {
  return getScoreBadge().textContent?.replace(/^Score:\s*/, '') ?? ''
}

// The reveal-letter (AlphabetKeyboard) UI only renders in "reveal" mode,
// entered via the Buy Letter toggle; the default mode is the on-screen
// typing keyboard.
async function openRevealMode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /buy letter/i }))
}

// Every letter except 'C' — revealing all of these costs more than the
// starting budget (sum of every fixed price is comfortably over
// DEFAULT_REVEAL_BUDGET) regardless of the exact per-letter prices, so the
// score goes negative without hardcoding a magic subset. 'C' is held back
// so it can be revealed afterward, once already unaffordable.
const ALL_LETTERS_EXCEPT_C = 'ABDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

describe('App with the "Dogs" puzzle', () => {
  it('renders the clue and no submit control', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /clue: dogs/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('starts with a score of 2000', () => {
    render(<App />)
    expect(getScoreBadgeValue()).toBe('2000')
  })

  it('revealing a repeated letter fills and locks every occurrence board-wide', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('H'))

    const hCells = ['r0c1', 'r0c4', 'r7c2', 'r9c2', 'r12c2', 'r12c15', 'r13c1']
    for (const cellId of hCells) {
      expect(getCell(cellId).value).toBe('H')
      expect(getCell(cellId).readOnly).toBe(true)
    }
    // Already-revealed letter keys stay disabled.
    expect(getLetterButton('H').disabled).toBe(true)
    // Deducts exactly H's fixed cost, not 7x for the 7 cells it filled.
    expect(getScoreBadgeValue()).toBe(String(2000 - getLetterCost('H')))
  })

  it('typing-advance skips a cell locked via letter reveal', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('H')) // locks r0c1 and r0c4, among others

    await user.click(getCell('r0c0'))
    await user.keyboard('S')
    // r0c1 is locked, so focus should skip it and land on r0c2
    expect(document.activeElement).toBe(getCell('r0c2'))
  })

  it('supports the down direction via a single-direction cell (POODLE)', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r1c3')) // only belongs to POODLE (down)
    await user.keyboard('O')
    expect(document.activeElement).toBe(getCell('r2c3'))
    await user.keyboard('D')
    expect(document.activeElement).toBe(getCell('r3c3'))
  })

  it('arrow keys move spatially and stay put at a boundary', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r0c0'))
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(getCell('r0c1'))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(getCell('r0c0'))
    await user.keyboard('{ArrowLeft}')
    // nothing further left
    expect(document.activeElement).toBe(getCell('r0c0'))
  })

  it('arrow keys land on locked cells the same way everywhere, mid-line and at a corner', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('H')) // locks r0c1, mid-line in row 0
    await user.click(getLetterButton('D')) // locks r0c7, a corner cell

    await user.click(getCell('r0c0'))
    await user.keyboard('{ArrowRight}')
    // r0c1 is locked but still the nearest cell, so focus lands right on it
    expect(document.activeElement).toBe(getCell('r0c1'))

    await user.click(getCell('r0c6'))
    await user.keyboard('{ArrowRight}')
    // r0c7 (locked corner: last of SHEPHERD across, first of DALMATIAN
    // down) is reached the same consistent way
    expect(document.activeElement).toBe(getCell('r0c7'))

    await user.keyboard('{ArrowDown}')
    // turning the corner into DALMATIAN still works
    expect(document.activeElement).toBe(getCell('r1c7'))
  })

  it('backspace clears the current cell in place when it has content', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r0c0'))
    await user.keyboard('SH')
    expect(getCell('r0c1').value).toBe('H')
    expect(document.activeElement).toBe(getCell('r0c2'))

    await user.click(getCell('r0c1'))
    await user.keyboard('{Backspace}') // r0c1 has content -> clears it, stays
    expect(getCell('r0c1').value).toBe('')
    expect(document.activeElement).toBe(getCell('r0c1'))
  })

  it('backspace on an empty cell deletes the previous cell and moves back in one press', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r0c0'))
    await user.keyboard('SH')
    expect(getCell('r0c1').value).toBe('H')
    expect(document.activeElement).toBe(getCell('r0c2'))

    await user.keyboard('{Backspace}') // r0c2 is empty -> deletes r0c1's H and moves back
    expect(document.activeElement).toBe(getCell('r0c1'))
    expect(getCell('r0c1').value).toBe('')

    await user.keyboard('{Backspace}') // r0c1 now empty -> deletes r0c0's S and moves back
    expect(document.activeElement).toBe(getCell('r0c0'))
    expect(getCell('r0c0').value).toBe('')
  })

  it('never disables a reveal key based on affordability, even as the score goes negative', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    for (const letter of ALL_LETTERS_EXCEPT_C) {
      await user.click(getLetterButton(letter))
    }
    const score = DEFAULT_REVEAL_BUDGET - ALL_LETTERS_EXCEPT_C.reduce(
      (sum, letter) => sum + getLetterCost(letter),
      0,
    )
    expect(score).toBeLessThan(0)
    expect(getScoreBadgeValue()).toBe(String(score))

    // A letter far more expensive than the (negative) score must still be
    // enabled — reveals are never blocked by affordability.
    expect(getLetterButton('C').disabled).toBe(false)
    await user.click(getLetterButton('C'))
    expect(getScoreBadgeValue()).toBe(String(score - getLetterCost('C')))
  })

  it('shows the unused-credit badge styling at zero or positive score, and the used-credit styling once negative', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(getScoreBadge().className).toContain('credit-badge--unused')

    await openRevealMode(user)
    for (const letter of ALL_LETTERS_EXCEPT_C) {
      await user.click(getLetterButton(letter))
    }
    expect(getScoreBadgeValue().startsWith('-')).toBe(true)
    expect(getScoreBadge().className).toContain('credit-badge--used')
  })

  it('renders only one live score badge', () => {
    render(<App />)
    expect(screen.getAllByTestId('score-badge')).toHaveLength(1)
  })

  it('manual letter entry never affects the score', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(getScoreBadgeValue()).toBe('2000')
    await user.click(getCell('r0c0'))
    await user.keyboard('SHEPHERD')
    expect(getCell('r0c7').value).toBe('D')
    expect(getScoreBadgeValue()).toBe('2000')
  })

  it('announces the revealed letter and the resulting score', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('D'))
    const remaining = 2000 - getLetterCost('D')
    expect(
      screen.getByText(new RegExp(`unlocked d\\..*score.*${remaining}`, 'i')),
    ).toBeTruthy()
  })

  it('marks every cell complete and read-only once the whole puzzle is filled in correctly', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const cell of Object.values(dogsPuzzle.cells)) {
      await user.click(getCell(cell.id))
      await user.keyboard(cell.correctLetter)
    }

    for (const cell of Object.values(dogsPuzzle.cells)) {
      const input = getCell(cell.id)
      expect(input.className).toContain('cell--complete')
      expect(input.readOnly).toBe(true)
    }
  })
})
