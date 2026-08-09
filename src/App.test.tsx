// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { flowerPuzzle } from './data/flowerPuzzle'
import { DEFAULT_REVEAL_BUDGET, getLetterCost } from './core/letterCosts'

afterEach(cleanup)

// Relevant Flower-puzzle layout, for reference:
//   CHRYSANTHEMUM across, row 10, cols 3-15: r10c3=C r10c4=H r10c5=R r10c6=Y
//                                             r10c7=S r10c8=A r10c9=N r10c10=T
//                                             r10c11=H r10c12=E r10c13=M r10c14=U
//                                             r10c15=M
//   MARIGOLD down, col 15, rows 10-17:       r10c15=M r11c15=A r12c15=R r13c15=I
//                                             r14c15=G r15c15=O r16c15=L r17c15=D
//   ORCHID down, col 19, rows 1-6:           r1c19=O r2c19=R r3c19=C r4c19=H
//                                             r5c19=I r6c19=D
// Starting score is 2000. Every letter has a fixed cost from LETTER_COSTS
// regardless of how many times (or whether) it appears in this puzzle, and
// the score is a running total — reveals are never blocked by it, and it
// can go negative. 'D' appears 10 times (r0c10, r6c19, r7c13, r7c18, r13c9,
// r15c11, r15c16, r16c5, r17c15, r19c5) — a real repeated letter.

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

describe('App with the "Flower" puzzle', () => {
  it('renders the clue and no submit control', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /clue: flowers/i })).toBeTruthy()
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
    await user.click(getLetterButton('D'))

    const dCells = [
      'r0c10', 'r6c19', 'r7c13', 'r7c18', 'r13c9',
      'r15c11', 'r15c16', 'r16c5', 'r17c15', 'r19c5',
    ]
    for (const cellId of dCells) {
      expect(getCell(cellId).value).toBe('D')
      expect(getCell(cellId).readOnly).toBe(true)
    }
    // Already-revealed letter keys stay disabled.
    expect(getLetterButton('D').disabled).toBe(true)
    // Deducts exactly D's fixed cost, not 10x for the 10 cells it filled.
    expect(getScoreBadgeValue()).toBe(String(2000 - getLetterCost('D')))
  })

  it('flags a manually-typed letter that has already been fully revealed elsewhere', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('D')) // locks every D cell board-wide

    // r0c2 is LILAC's first cell ('L') — not one of the D cells, so it's
    // still editable, but any 'D' typed here is provably wrong: every D
    // has already been placed elsewhere by the reveal.
    await user.click(getCell('r0c2'))
    await user.keyboard('D')

    expect(getCell('r0c2').value).toBe('D')
    expect(getCell('r0c2').className).toContain('cell--impossible')
    expect(
      screen.getByText(/every "d" has already been revealed/i),
    ).toBeTruthy()
  })

  it('deleting the impossible letter clears the cell highlight and dismisses the banner', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('D'))
    await user.click(getCell('r0c2'))
    await user.keyboard('D')
    expect(getCell('r0c2').className).toContain('cell--impossible')

    await user.click(getCell('r0c2'))
    await user.keyboard('{Backspace}')

    expect(getCell('r0c2').value).toBe('')
    expect(getCell('r0c2').className).not.toContain('cell--impossible')
    expect(screen.queryByText(/already been revealed/i)).toBeNull()
  })

  it('deleting the impossible letter via chained backspace from the next cell also clears the alert', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('D'))
    await user.click(getCell('r0c2'))
    await user.keyboard('D')
    expect(getCell('r0c2').className).toContain('cell--impossible')
    // r0c2 only belongs to LILAC (across), so typing auto-advanced focus
    // right to r0c3, which is still empty.
    expect(document.activeElement).toBe(getCell('r0c3'))

    await user.keyboard('{Backspace}') // r0c3 is empty -> deletes r0c2's D and moves back

    expect(getCell('r0c2').value).toBe('')
    expect(getCell('r0c2').className).not.toContain('cell--impossible')
    expect(screen.queryByText(/already been revealed/i)).toBeNull()
  })

  it('dismisses the impossible-letter banner and cell highlight via the close button', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('D'))
    await user.click(getCell('r0c2'))
    await user.keyboard('D')
    expect(getCell('r0c2').className).toContain('cell--impossible')

    await user.click(screen.getByRole('button', { name: /dismiss message/i }))

    expect(screen.queryByText(/already been revealed/i)).toBeNull()
    expect(getCell('r0c2').className).not.toContain('cell--impossible')
  })

  it('typing-advance skips a cell locked via letter reveal', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('H')) // locks r10c4, among others

    await user.click(getCell('r10c3'))
    await user.keyboard('C')
    // r10c4 is locked, so focus should skip it and land on r10c5
    expect(document.activeElement).toBe(getCell('r10c5'))
  })

  it('supports the down direction via a single-direction cell (ORCHID)', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r1c19')) // only belongs to ORCHID (down)
    await user.keyboard('O')
    expect(document.activeElement).toBe(getCell('r2c19'))
    await user.keyboard('R')
    expect(document.activeElement).toBe(getCell('r3c19'))
  })

  it('arrow keys move spatially and stay put at a boundary', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r0c6'))
    await user.keyboard('{ArrowRight}')
    // c7 has no cell, so focus jumps straight to the next real one
    expect(document.activeElement).toBe(getCell('r0c8'))
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(getCell('r0c6'))

    await user.click(getCell('r0c2')) // leftmost cell in row 0
    await user.keyboard('{ArrowLeft}')
    // nothing further left
    expect(document.activeElement).toBe(getCell('r0c2'))
  })

  it('arrow keys land on locked cells the same way everywhere, mid-line and at a corner', async () => {
    const user = userEvent.setup()
    render(<App />)

    await openRevealMode(user)
    await user.click(getLetterButton('H')) // locks r10c4, mid-line in row 10
    await user.click(getLetterButton('M')) // locks r10c15, a corner cell

    await user.click(getCell('r10c3'))
    await user.keyboard('{ArrowRight}')
    // r10c4 is locked but still the nearest cell, so focus lands right on it
    expect(document.activeElement).toBe(getCell('r10c4'))

    await user.click(getCell('r10c14'))
    await user.keyboard('{ArrowRight}')
    // r10c15 (locked corner: last of CHRYSANTHEMUM across, first of
    // MARIGOLD down) is reached the same consistent way
    expect(document.activeElement).toBe(getCell('r10c15'))

    await user.keyboard('{ArrowDown}')
    // turning the corner into MARIGOLD still works
    expect(document.activeElement).toBe(getCell('r11c15'))
  })

  it('backspace clears the current cell in place when it has content', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r10c3'))
    await user.keyboard('CH')
    expect(getCell('r10c4').value).toBe('H')
    expect(document.activeElement).toBe(getCell('r10c5'))

    await user.click(getCell('r10c4'))
    await user.keyboard('{Backspace}') // r10c4 has content -> clears it, stays
    expect(getCell('r10c4').value).toBe('')
    expect(document.activeElement).toBe(getCell('r10c4'))
  })

  it('backspace on an empty cell deletes the previous cell and moves back in one press', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r10c3'))
    await user.keyboard('CH')
    expect(getCell('r10c4').value).toBe('H')
    expect(document.activeElement).toBe(getCell('r10c5'))

    await user.keyboard('{Backspace}') // r10c5 is empty -> deletes r10c4's H and moves back
    expect(document.activeElement).toBe(getCell('r10c4'))
    expect(getCell('r10c4').value).toBe('')

    await user.keyboard('{Backspace}') // r10c4 now empty -> deletes r10c3's C and moves back
    expect(document.activeElement).toBe(getCell('r10c3'))
    expect(getCell('r10c3').value).toBe('')
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

  it('shows the gold badge styling at the starting (high) score, and the bust styling once negative', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(getScoreBadge().className).toContain('credit-badge--gold')

    await openRevealMode(user)
    for (const letter of ALL_LETTERS_EXCEPT_C) {
      await user.click(getLetterButton(letter))
    }
    expect(getScoreBadgeValue().startsWith('-')).toBe(true)
    expect(getScoreBadge().className).toContain('credit-badge--bust')
  })

  it('renders only one live score badge', () => {
    render(<App />)
    expect(screen.getAllByTestId('score-badge')).toHaveLength(1)
  })

  it('manual letter entry never affects the score', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(getScoreBadgeValue()).toBe('2000')
    await user.click(getCell('r10c3'))
    await user.keyboard('CHRYSANTHEMUM')
    expect(getCell('r10c15').value).toBe('M')
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

    for (const cell of Object.values(flowerPuzzle.cells)) {
      await user.click(getCell(cell.id))
      await user.keyboard(cell.correctLetter)
    }

    for (const cell of Object.values(flowerPuzzle.cells)) {
      const input = getCell(cell.id)
      expect(input.className).toContain('cell--complete')
      expect(input.readOnly).toBe(true)
    }
  })

  it('shows the result modal with the award and final score immediately on completion, and closes via the close button', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Filled entirely by typing, no reveals, so the score stays at the
    // full starting budget (2000) — comfortably in Gold range (>= 1200).
    for (const cell of Object.values(flowerPuzzle.cells)) {
      await user.click(getCell(cell.id))
      await user.keyboard(cell.correctLetter)
    }

    expect(screen.getByRole('dialog', { name: /puzzle complete/i })).toBeTruthy()
    expect(screen.getByText('Gold')).toBeTruthy()
    expect(screen.getByText('Final Score: 2000')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /^close$/i }))
    expect(screen.queryByRole('dialog', { name: /puzzle complete/i })).toBeNull()
  })
})
