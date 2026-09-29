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
  it('shows the pool summary and diagnostics in order: errors, warnings, info', async () => {
    const user = await setup()
    await user.click(screen.getByLabelText('Candidate words'))
    await user.paste('beagle, poodle\nPOODLE\nk9\n\n')

    expect(screen.getByText('2 usable answers')).toBeTruthy()
    expect(screen.getByText('3–5: 0')).toBeTruthy()
    expect(screen.getByText('6–8: 2')).toBeTruthy()
    expect(screen.getByText('9+: 0')).toBeTruthy()
    expect(screen.getByText('Average: 6.0 letters')).toBeTruthy()

    const items = [...document.querySelectorAll('.ws-diagnostics > li')].map((li) => li.textContent ?? '')
    expect(items.map((text) => text.split(':')[0])).toEqual(['Error', 'Warning', 'Note', 'Note'])
    expect(items[0]).toMatch('Not enough candidate answers')
    expect(items[1]).toMatch('Few short answers. Only 0%')
    expect(items[2]).toMatch('1 duplicate entry removed.')
    expect(items[3]).toMatch('1 invalid entry excluded.')
    expect(screen.getByText('k9')).toBeTruthy()
  })

  it('marks Generate unavailable while the pool has an error, and blocks it on submit', async () => {
    const user = await setup()
    await user.type(screen.getByLabelText('Clue'), 'Dogs')
    const button = screen.getByRole('button', { name: 'Generate Candidates' })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('aria-describedby')).toBe('ws-diagnostic-not-enough-answers')

    await generate(user)
    expect(screen.getByRole('alert').textContent).toMatch('Not enough candidate answers')
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()

    await user.click(screen.getByLabelText('Candidate words'))
    await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
    expect(button.getAttribute('aria-disabled')).toBe('false')
    expect(button.hasAttribute('aria-describedby')).toBe(false)
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

describe('WorkshopApp candidate sourcing and Pool Review', () => {
  async function sourceDogs(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Clue'), 'Dogs')
    await user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    return screen.findByRole('region', { name: 'Pool Review' })
  }

  const rowFor = (review: HTMLElement, answer: string) =>
    within(review).getByRole('checkbox', { name: `Include ${answer}` }).closest('tr')!

  it('requires a clue before sourcing, with explicit Exclude defaults for proper nouns and abbreviations', async () => {
    const user = await setup()
    await user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    expect((screen.getByLabelText('Proper nouns') as HTMLSelectElement).value).toBe('exclude')
    expect((screen.getByLabelText('Abbreviations') as HTMLSelectElement).value).toBe('exclude')
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    expect(screen.getByRole('alert').textContent).toBe('Enter a clue.')
  })

  it('sends clue, author context and settings to the candidate source', async () => {
    const requests: unknown[] = []
    const spySource = {
      generate: (request: unknown) => {
        requests.push(request)
        return Promise.resolve({ candidates: [] })
      },
    }
    const user = userEvent.setup()
    render(<WorkshopApp candidateSource={spySource} />)
    await user.type(screen.getByLabelText('Clue'), 'Car Brands')
    await user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    await user.type(screen.getByLabelText('Author context (optional)'), 'Manufacturers only')
    await user.selectOptions(screen.getByLabelText('Proper nouns'), 'allow')
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    await screen.findByRole('region', { name: 'Pool Review' })
    expect(requests).toEqual([
      {
        clue: 'Car Brands',
        context: 'Manufacturers only',
        targetCount: 60,
        options: { properNouns: 'allow', abbreviations: 'exclude' },
      },
    ])
  })

  it('shows sourced candidates with metadata, construction forms, mechanical notes and review flags — without generating', async () => {
    const user = await setup()
    const review = await sourceDogs(user)

    expect(review.querySelector('p')?.textContent).toBe(
      'Sourced for “Dogs” · 35 candidates · 33 included · 6 flagged · 1 duplicate · 1 invalid · 1 malformed',
    )
    expect(review.querySelector('.ws-diagnostics li')?.textContent).toBe(
      'Sourcing issue: Candidate "Harness": rationale is not a string. Not added to the pool.',
    )

    const dane = rowFor(review, 'Great Dane')
    expect(dane.textContent).toMatch('GREATDANE')
    expect(dane.textContent).toMatch('The Great Dane is a giant dog breed.')
    expect(dane.textContent).toMatch('Breeds')

    const copy = within(review).getByRole('checkbox', { name: 'Include great-dane' }) as HTMLInputElement
    expect([copy.checked, copy.disabled]).toEqual([false, true])
    expect(rowFor(review, 'great-dane').textContent).toMatch('Duplicate of Great Dane')

    const bernard = within(review).getByRole('checkbox', { name: 'Include St. Bernard' }) as HTMLInputElement
    expect([bernard.checked, bernard.disabled]).toEqual([false, true])
    expect(rowFor(review, 'St. Bernard').textContent).toMatch('Invalid: "St. Bernard" contains characters outside A-Z.')

    const puppies = within(review).getByRole('checkbox', { name: 'Include Puppies' }) as HTMLInputElement
    expect(puppies.checked).toBe(true)
    expect(rowFor(review, 'Puppies').textContent).toMatch('Possible singular/plural of Puppy')
    expect(rowFor(review, 'Dog Parks').textContent).toMatch('Possible singular/plural of Dog Park')
    expect(rowFor(review, 'Walking').textContent).toMatch('Possible variant of Walk')

    // Existing Pool Diagnostics run over the included pool.
    expect(screen.getByText('33 usable answers')).toBeTruthy()
    expect(screen.getByText(/1 duplicate entry removed\./)).toBeTruthy()
    expect(screen.getByText(/1 invalid entry excluded\./)).toBeTruthy()
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
  })

  it('recalculates diagnostics when the author excludes and re-includes a candidate', async () => {
    const user = await setup()
    const review = await sourceDogs(user)
    const beagle = within(review).getByRole('checkbox', { name: 'Include Beagle' })
    await user.click(beagle)
    expect(screen.getByText('32 usable answers')).toBeTruthy()
    await user.click(beagle)
    expect(screen.getByText('33 usable answers')).toBeTruthy()
  })

  it('generates only from the included usable pool', async () => {
    const user = await setup()
    const review = await sourceDogs(user)
    await user.click(within(review).getByRole('checkbox', { name: 'Include Beagle' }))
    await generate(user)
    expect(screen.getByText(/Clue “Dogs” · 32 words/)).toBeTruthy()
    for (const card of candidateCards()) {
      expect(card.textContent).not.toMatch(/\bBEAGLE\b|STBERNARD/)
    }
  })
})
