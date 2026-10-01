// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOGS_BREEDS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsBreedsCandidatePool.js'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { CandidateSourcingError } from './sourcing/contract'
import { FIXTURE_SOURCING_RESPONSE } from './sourcing/fixtureSource'
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

async function approve(user: ReturnType<typeof userEvent.setup>, cardIndex: number) {
  await user.click(candidateCards()[cardIndex])
  await user.click(screen.getByRole('button', { name: /Approve Candidate|Open Final Puzzle/ }))
}

function finalPuzzle() {
  return screen.getByRole('region', { name: /Final Puzzle/ })
}

function validationStatus() {
  return within(finalPuzzle()).getAllByRole('status')[0].textContent ?? ''
}

describe('WorkshopApp approval and Final Puzzle', () => {
  it('approving opens the Final Puzzle with the batch clue, a suggested id, the board, and answers', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const user = await setup()
    await fillInputs(user)
    await generate(user)
    await approve(user, 3)

    const region = finalPuzzle()
    expect(within(region).getByRole('heading', { name: /Final Puzzle/ }).textContent).toMatch('Approved Candidate 4')
    expect(document.activeElement).toBe(within(region).getByRole('heading', { name: /Final Puzzle/ }))
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
    expect((screen.getByLabelText('Clue') as HTMLInputElement).value).toBe('Dogs')
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('dogs')
    expect(within(region).getByRole('img', { name: /Final puzzle board, \d+ by \d+ grid/ })).toBeTruthy()
    expect(within(region).getByText(/^Answers \(\d+\)$/)).toBeTruthy()
    expect(within(region).getByText('Size')).toBeTruthy()

    // The suggested id collides with the production Dogs puzzle.
    expect(validationStatus()).toMatch('Validation errors (1)')
    expect(validationStatus()).toMatch('Puzzle ID “dogs” is already used by a production puzzle.')
    expect(screen.getByLabelText('Puzzle ID').getAttribute('aria-invalid')).toBe('true')
    const blocked = within(region).getByRole('button', { name: 'Download Puzzle Modules' })
    expect(blocked.getAttribute('aria-disabled')).toBe('true')

    // Session-only: nothing is persisted.
    expect(setItem).not.toHaveBeenCalled()
  })

  it('updates validation as the id and clue change, enabling export only when valid', async () => {
    const user = await setup()
    await fillInputs(user)
    await generate(user)
    await approve(user, 0)

    const id = screen.getByLabelText('Puzzle ID')
    await user.clear(id)
    expect(validationStatus()).toMatch('Puzzle ID is required.')
    await user.type(id, 'Dogs-2')
    expect(validationStatus()).toMatch('lowercase letters a–z and digits')
    await user.clear(id)
    await user.type(id, 'workshopdogs')
    expect(validationStatus()).toMatch('Ready to export.')
    expect(id.getAttribute('aria-invalid')).toBe('false')

    const region = finalPuzzle()
    expect(within(region).getByRole('button', { name: 'Download workshopdogsPuzzle.ts' })).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Download workshopdogsPuzzleLayout.ts' })).toBeTruthy()
    expect(within(region).getByText('Save as src/data/workshopdogsPuzzle.ts')).toBeTruthy()

    const clue = screen.getByLabelText('Clue')
    await user.clear(clue)
    await user.type(clue, '   ')
    expect(validationStatus()).toMatch('Clue is required.')
    expect(within(region).queryByRole('button', { name: /Download workshopdogs/ })).toBeNull()
    expect(within(region).getByRole('button', { name: 'Download Puzzle Modules' }).getAttribute('aria-disabled')).toBe(
      'true',
    )

    await user.clear(clue)
    await user.type(clue, "Man's best friend")
    expect(validationStatus()).toMatch('Ready to export.')
    expect(within(region).getByText(/clue: 'Man\\'s best friend'/)).toBeTruthy()
  })

  it('downloads each module with its filename, and copies the registry snippet', async () => {
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob
      return 'blob:export'
    })
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const downloads: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    })

    const user = await setup()
    await fillInputs(user)
    await generate(user)
    await approve(user, 0)
    await user.clear(screen.getByLabelText('Puzzle ID'))
    await user.type(screen.getByLabelText('Puzzle ID'), 'workshopdogs')

    await user.click(screen.getByRole('button', { name: 'Download workshopdogsPuzzle.ts' }))
    await user.click(screen.getByRole('button', { name: 'Download workshopdogsPuzzleLayout.ts' }))
    expect(downloads).toEqual(['workshopdogsPuzzle.ts', 'workshopdogsPuzzleLayout.ts'])
    const source = await createObjectURL.mock.calls[0][0].text()
    expect(source).toMatch("export const workshopdogsPuzzle: PuzzleDefinition = {")
    expect(source).toMatch('unlockBudget: DEFAULT_REVEAL_BUDGET,')

    await user.click(screen.getByRole('button', { name: 'Copy Registry Snippet' }))
    expect(await navigator.clipboard.readText()).toMatch(
      'workshopdogs: { puzzle: workshopdogsPuzzle, layout: workshopdogsPuzzleLayout },',
    )
    expect(screen.getByText('Registry snippet copied.')).toBeTruthy()
    expect(screen.getByText(/Add the new puzzle to src\/core\/validatePuzzleDefinition.test.ts/)).toBeTruthy()

    // Export is a developer fallback; scheduling is left to a future publishing workflow.
    const region = finalPuzzle()
    expect(within(region).getByRole('heading', { name: 'Developer export' })).toBeTruthy()
    expect(within(region).getByText(/^Temporary developer fallback\./)).toBeTruthy()
    expect(within(region).getByText(/^Developer integration reference only\./)).toBeTruthy()
    expect(within(region).getByRole('heading', { name: 'Manual developer integration' })).toBeTruthy()
    expect(within(region).getByText(/^Publishing and scheduling are intentionally not included here\./)).toBeTruthy()
    expect(within(region).getByText('Commit the integration changes.')).toBeTruthy()
    expect(region.textContent).not.toMatch(/offsetDays|offset|SCHEDULE|bump|After exporting/)
  })

  it('Back returns to Candidate Review unchanged; reopening keeps edits; approving another candidate replaces it', async () => {
    const user = await setup()
    await fillInputs(user)
    await generate(user)
    await approve(user, 3)
    const firstBoard = within(finalPuzzle()).getByRole('img').innerHTML
    await user.clear(screen.getByLabelText('Puzzle ID'))
    await user.type(screen.getByLabelText('Puzzle ID'), 'edited')

    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    expect(screen.queryByRole('region', { name: /Final Puzzle/ })).toBeNull()
    const cards = candidateCards()
    expect(cards).toHaveLength(20)
    expect(cards[3].textContent).toMatch('Approved')
    expect(cards[3].getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/Candidate 4 approved/)).toBeTruthy()
    expect((screen.getByLabelText('Clue') as HTMLInputElement).value).toBe('Dogs')
    const reopen = screen.getByRole('button', { name: 'Open Final Puzzle' })
    expect(document.activeElement).toBe(reopen)

    await user.click(reopen)
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('edited')
    expect(within(finalPuzzle()).getByRole('img').innerHTML).toBe(firstBoard)

    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    await approve(user, 7)
    expect(within(finalPuzzle()).getByRole('heading', { name: /Final Puzzle/ }).textContent).toMatch(
      'Approved Candidate 8',
    )
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('dogs')
    expect(within(finalPuzzle()).getByRole('img').innerHTML).not.toBe(firstBoard)

    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    expect(candidateCards()[7].textContent).toMatch('Approved')
    expect(candidateCards()[3].textContent).not.toMatch('Approved')
  })

  it('a new generation clears selection and approval and uses the next seed', async () => {
    const user = await setup()
    await fillInputs(user)
    await generate(user)

    await approve(user, 0)
    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
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
  it('handles 1, then 4, then 1, then 0 candidates with correct numbering, selection, and approval resets', async () => {
    // The long-word breed pool at 10–16 answers: batches 1–4 find 1, 4, 1
    // and 0 candidates respectively.
    const user = await setup()
    await user.type(screen.getByLabelText('Clue'), 'Dogs')
    await user.click(screen.getByLabelText('Candidate words'))
    await user.paste(DOGS_BREEDS_CANDIDATE_POOL.join('\n'))

    await generate(user)
    expect(screen.getByRole('heading', { name: 'Generated Candidates (1)' })).toBeTruthy()
    await approve(user, 0)
    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    expect(screen.getByRole('region', { name: /Selected Candidate 1/ })).toBeTruthy()
    expect(candidateCards()[0].textContent).toMatch('Approved')

    await generate(user)
    expect(screen.getByRole('heading', { name: 'Generated Candidates (4)' })).toBeTruthy()
    const cards = candidateCards()
    expect(cards.map((card) => card.textContent?.match(/Candidate \d+/)?.[0])).toEqual([
      'Candidate 1',
      'Candidate 2',
      'Candidate 3',
      'Candidate 4',
    ])
    expect(cards.every((card) => card.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(cards.some((card) => card.textContent?.includes('Approved'))).toBe(false)
    await user.click(cards[2])
    expect(screen.getByRole('region', { name: /Selected Candidate 3/ })).toBeTruthy()

    await generate(user)
    expect(screen.getByRole('heading', { name: 'Generated Candidates (1)' })).toBeTruthy()
    expect(screen.getByText('Select a candidate to inspect it.')).toBeTruthy()

    await generate(user)
    const region = screen.getByRole('region', { name: /Generated Candidates \(0\)/ })
    expect(within(region).queryAllByRole('button')).toHaveLength(0)
    expect(within(region).getByText(/No valid candidates with 10–16 answers were found/)).toBeTruthy()
    expect(screen.getByText('Select a candidate to inspect it.')).toBeTruthy()
    expect(screen.getByText(/seed workshop-generation-4/)).toBeTruthy()
  })
})

describe('WorkshopApp candidate sourcing and Pool Review', () => {
  async function sourceDogs(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Clue'), 'Dogs')
    await user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    await user.selectOptions(screen.getByLabelText('Candidate source'), 'fixture')
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
    expect(screen.getByRole('alert').textContent).toBe('Error: Enter a clue.')
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
    render(<WorkshopApp sources={{ live: spySource }} />)
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

describe('WorkshopApp live sourcing', () => {
  const fixturePayload = () => JSON.parse(JSON.stringify(FIXTURE_SOURCING_RESPONSE)) as unknown

  async function startLive(sources: NonNullable<Parameters<typeof WorkshopApp>[0]>['sources']) {
    const user = userEvent.setup()
    render(<WorkshopApp sources={sources} />)
    await user.type(screen.getByLabelText('Clue'), 'Dogs')
    await user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    return user
  }

  it('defaults to the live source and feeds its payload through the existing review pipeline', async () => {
    const live = { generate: vi.fn(() => Promise.resolve(fixturePayload())) }
    const fixture = { generate: vi.fn() }
    const user = await startLive({ live, fixture })
    expect((screen.getByLabelText('Candidate source') as HTMLSelectElement).value).toBe('live')
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    const review = await screen.findByRole('region', { name: 'Pool Review' })
    expect(review.querySelector('p')?.textContent).toMatch('35 candidates · 33 included · 6 flagged · 1 duplicate · 1 invalid')
    expect(screen.getByText('33 usable answers')).toBeTruthy()
    expect(fixture.generate).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
  })

  it('shows a loading state and ignores repeat submissions while a request is running', async () => {
    let resolve!: (value: unknown) => void
    const live = { generate: vi.fn(() => new Promise((r) => (resolve = r))) }
    const user = await startLive({ live })
    const button = screen.getByRole('button', { name: 'Source Candidates' })
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Sourcing…' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('status').textContent).toMatch('Sourcing candidates…')
    await user.click(screen.getByRole('button', { name: 'Sourcing…' }))
    expect(live.generate).toHaveBeenCalledTimes(1)
    resolve(fixturePayload())
    await screen.findByRole('region', { name: 'Pool Review' })
    expect(screen.getByRole('button', { name: 'Source Candidates' })).toHaveProperty('disabled', false)
  })

  it('on failure keeps the previous Pool Review, shows the error category, never falls back or generates', async () => {
    const live = {
      generate: vi
        .fn()
        .mockResolvedValueOnce(fixturePayload())
        .mockRejectedValueOnce(new CandidateSourcingError('provider', 'The provider is rate limiting requests (HTTP 429).')),
    }
    const fixture = { generate: vi.fn() }
    const user = await startLive({ live, fixture })
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    const review = await screen.findByRole('region', { name: 'Pool Review' })
    await user.click(within(review).getByRole('checkbox', { name: 'Include Beagle' }))

    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'Provider error: The provider is rate limiting requests (HTTP 429). The previous Pool Review below is unchanged.',
    )
    // Same review, including the author's exclusion; no fixture fallback; no generation.
    expect(screen.getByRole('region', { name: 'Pool Review' })).toBeTruthy()
    expect(screen.getByText('32 usable answers')).toBeTruthy()
    expect(fixture.generate).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()

    // Retrying is a deliberate click, and it works.
    live.generate.mockResolvedValueOnce(fixturePayload())
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(live.generate).toHaveBeenCalledTimes(3)
  })

  it('labels configuration errors, and malformed payloads as response errors (not candidate invalidity)', async () => {
    const live = {
      generate: vi
        .fn()
        .mockRejectedValueOnce(new CandidateSourcingError('configuration', 'ANTHROPIC_API_KEY is not set for the Workshop server (.env.local).'))
        .mockResolvedValueOnce({ answers: ['Beagle'] }),
    }
    const user = await startLive({ live })
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Configuration error: ANTHROPIC_API_KEY is not set for the Workshop server (.env.local).',
    )
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Response error: Sourcing response has no candidates array.'),
    )
    expect(screen.queryByRole('region', { name: 'Pool Review' })).toBeNull()
  })
})
