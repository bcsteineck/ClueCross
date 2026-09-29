// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOGS_BREEDS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsBreedsCandidatePool.js'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { WorkshopApp } from './WorkshopApp'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function setup() {
  const user = userEvent.setup()
  render(<WorkshopApp />)
  return user
}

async function fillInputs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Clue'), 'Dogs')
  // paste rather than type: typing 18 lines keystroke-by-keystroke is slow
  await user.click(screen.getByLabelText('Candidate words'))
  await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
}

function candidateCards() {
  return within(screen.getByRole('region', { name: /Generated Candidates/ })).getAllByRole('button')
}

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
}

describe('WorkshopApp inputs', () => {
  it('shows the normalized candidate count and flags invalid and duplicate words', async () => {
    const user = await setup()
    await user.click(screen.getByLabelText('Candidate words'))
    await user.paste('beagle, poodle\nPOODLE\nhot-dog\n\n')

    expect(screen.getByText('2 candidate words')).toBeTruthy()
    expect(screen.getByText(/"hot-dog" contains characters outside A-Z/)).toBeTruthy()
    expect(screen.getByText('POODLE appears 2 times')).toBeTruthy()
  })

  it('requires a clue before generating', async () => {
    const user = await setup()
    await user.click(screen.getByLabelText('Candidate words'))
    await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
    await generate(user)

    expect(screen.getByRole('alert').textContent).toMatch('Enter a clue.')
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
  })
})

describe('WorkshopApp candidates', () => {
  it('shows up to 20 candidate cards with answer count, dimensions, cells, and cell size', async () => {
    const user = await setup()
    await fillInputs(user)
    await generate(user)

    expect(screen.getByRole('heading', { name: 'Generated Candidates (20)' })).toBeTruthy()
    const cards = candidateCards()
    expect(cards).toHaveLength(20)
    const first = cards[0].textContent ?? ''
    expect(first).toMatch(/Candidate 1/)
    expect(first).toMatch(/\d+ answers/)
    expect(first).toMatch(/\d+ × \d+/)
    expect(first).toMatch(/\d+ cells/)
    expect(first).toMatch(/[\d.]+px @ 360/)
    expect(screen.getByText(/seed workshop-generation-1/)).toBeTruthy()
  })

  it('selects a candidate and shows its detail', async () => {
    const user = await setup()
    await fillInputs(user)
    await generate(user)
    expect(screen.getByText('Select a candidate to inspect it.')).toBeTruthy()

    const cards = candidateCards()
    await user.click(cards[2])
    expect(cards[2].getAttribute('aria-pressed')).toBe('true')
    expect(cards[0].getAttribute('aria-pressed')).toBe('false')

    const detail = screen.getByRole('region', { name: /Selected Candidate 3/ })
    expect(within(detail).getByRole('img', { name: /Puzzle preview, \d+ by \d+ grid/ })).toBeTruthy()
    expect(within(detail).getByText(/Selected answers \(\d+\)/)).toBeTruthy()
    expect(within(detail).getByText(/Unselected candidate words \(\d+\)/)).toBeTruthy()
    expect(within(detail).getByText(/cells @ 360px board/)).toBeTruthy()
    expect(within(detail).getByText('Authored intersections')).toBeTruthy()
    expect(within(detail).getByText('Incidental entries')).toBeTruthy()

    await user.click(cards[5])
    expect(screen.getByRole('region', { name: /Selected Candidate 6/ })).toBeTruthy()
    expect(cards[2].getAttribute('aria-pressed')).toBe('false')
  })

  it('selection is keyboard-operable', async () => {
    const user = await setup()
    await fillInputs(user)
    await generate(user)

    const cards = candidateCards()
    cards[1].focus()
    await user.keyboard('{Enter}')
    expect(cards[1].getAttribute('aria-pressed')).toBe('true')
  })
})

describe('WorkshopApp approval', () => {
  it('approves the selected candidate and keeps it approved while inspecting others', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const user = await setup()
    await fillInputs(user)
    await generate(user)

    const cards = candidateCards()
    await user.click(cards[3])
    await user.click(screen.getByRole('button', { name: 'Approve Candidate' }))

    expect(screen.getByRole('button', { name: 'Approved' })).toHaveProperty('disabled', true)
    expect(cards[3].textContent).toMatch('Approved')
    expect(screen.getByText(/Approval is temporary in this version/)).toBeTruthy()

    await user.click(cards[7])
    expect(screen.getByRole('button', { name: 'Approve Candidate' })).toBeTruthy()
    expect(cards[3].textContent).toMatch('Approved')
    expect(cards[7].textContent).not.toMatch('Approved')
    expect(screen.getByText(/Candidate 4 approved/)).toBeTruthy()

    // Session-only: nothing is persisted.
    expect(setItem).not.toHaveBeenCalled()
  })

  it('a new generation clears selection and approval and uses the next seed', async () => {
    const user = await setup()
    await fillInputs(user)
    await generate(user)

    await user.click(candidateCards()[0])
    await user.click(screen.getByRole('button', { name: 'Approve Candidate' }))
    expect(candidateCards()[0].textContent).toMatch('Approved')

    await generate(user)

    expect(screen.getByText(/seed workshop-generation-2/)).toBeTruthy()
    expect(screen.getByText('Select a candidate to inspect it.')).toBeTruthy()
    for (const card of candidateCards()) {
      expect(card.getAttribute('aria-pressed')).toBe('false')
      expect(card.textContent).not.toMatch('Approved')
    }
  })
})

describe('WorkshopApp small and empty batches', () => {
  it('handles 2, then 3, then 0 candidates with correct numbering, selection, and approval resets', async () => {
    // The long-word breed pool at 10–16 answers: batches 1, 2, 3 find
    // 2, 3 and 0 candidates respectively.
    const user = await setup()
    await user.type(screen.getByLabelText('Clue'), 'Dogs')
    await user.click(screen.getByLabelText('Candidate words'))
    await user.paste(DOGS_BREEDS_CANDIDATE_POOL.join('\n'))

    await generate(user)
    expect(screen.getByRole('heading', { name: 'Generated Candidates (2)' })).toBeTruthy()
    await user.click(candidateCards()[0])
    await user.click(screen.getByRole('button', { name: 'Approve Candidate' }))
    expect(screen.getByRole('region', { name: /Selected Candidate 1/ })).toBeTruthy()
    expect(candidateCards()[0].textContent).toMatch('Approved')

    await generate(user)
    expect(screen.getByRole('heading', { name: 'Generated Candidates (3)' })).toBeTruthy()
    const cards = candidateCards()
    expect(cards.map((card) => card.textContent?.match(/Candidate \d+/)?.[0])).toEqual([
      'Candidate 1',
      'Candidate 2',
      'Candidate 3',
    ])
    expect(cards.every((card) => card.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(cards.some((card) => card.textContent?.includes('Approved'))).toBe(false)
    await user.click(cards[2])
    expect(screen.getByRole('region', { name: /Selected Candidate 3/ })).toBeTruthy()

    await generate(user)
    const region = screen.getByRole('region', { name: /Generated Candidates \(0\)/ })
    expect(within(region).queryAllByRole('button')).toHaveLength(0)
    expect(within(region).getByText(/No valid candidates with 10–16 answers were found/)).toBeTruthy()
    expect(screen.getByText('Select a candidate to inspect it.')).toBeTruthy()
    expect(screen.getByText(/seed workshop-generation-3/)).toBeTruthy()
  })
})
