// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOGS_BREEDS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsBreedsCandidatePool.js'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import type { PreviewResponseBody, PublicationSummary, PublishRequest, PublishResponseBody } from './publishing/contract'
import type { ClientResult, PublishingClient } from './publishing/publishingClient'
import type { ProductionClient } from './production/productionClient'
import { CandidateSourcingError } from './sourcing/contract'
import { FIXTURE_SOURCING_RESPONSE } from './sourcing/fixtureSource'
import { WorkshopApp } from './WorkshopApp'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const NOT_CONFIGURED = { status: 'not-configured', message: 'Publishing is not configured on this Workshop server.' } as const

function publicationOf(request: PublishRequest, publishDate = '2026-10-04'): PublicationSummary {
  return {
    puzzleId: request.id.trim(),
    publishDate,
    releaseInstant: publishDate === '2026-10-04' ? '2026-10-04T02:00:00.000Z' : '2026-10-09T02:00:00.000Z',
    contentFingerprint: 'f'.repeat(64),
    fingerprintVersion: 1,
  }
}

const ESTIMATE: PreviewResponseBody = {
  status: 'estimate',
  estimate: { publishDate: '2026-10-04', releaseInstant: '2026-10-04T02:00:00.000Z', contentFingerprint: 'f'.repeat(64) },
}

// A fake PublishingClient: by default it estimates October 4 and creates
// the publication; tests override either side.
function fakePublisher(
  options: {
    preview?: (request: PublishRequest) => Promise<ClientResult<PreviewResponseBody>>
    publish?: (request: PublishRequest) => Promise<ClientResult<PublishResponseBody>>
  } = {},
) {
  return {
    preview: vi.fn<PublishingClient['preview']>(options.preview ?? (async () => ({ ok: true, body: ESTIMATE }))),
    publish: vi.fn<PublishingClient['publish']>(
      options.publish ?? (async (request) => ({ ok: true, body: { status: 'created', publication: publicationOf(request) } })),
    ),
  }
}

// Mirrors the live Workshop server today: no durable store configured.
const notConfiguredPublisher = () =>
  fakePublisher({
    preview: async () => ({ ok: true, body: NOT_CONFIGURED }),
    publish: async () => ({ ok: true, body: NOT_CONFIGURED }),
  })

async function setup(publisher: PublishingClient = notConfiguredPublisher(), production: ProductionClient | null = null) {
  const user = userEvent.setup()
  render(<WorkshopApp publisher={publisher} production={production} />)
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
    expect(validationStatus()).toMatch('Puzzle ID “dogs” is reserved (a legacy development puzzle or test fixture) and can’t be used.')
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

  it('downloads each module with its filename, as a developer-only export', async () => {
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

    // A developer-only export: no registry, schedule, or manual integration workflow.
    const region = finalPuzzle()
    expect(within(region).getByRole('heading', { name: 'Developer export' })).toBeTruthy()
    expect(
      within(region).getByText(
        'For inspection, debugging, test fixtures, or emergency manual work only. Publishing is how a puzzle reaches players: the server assigns its permanent date and the player loads it from the puzzle API at release — no code change or redeploy.',
      ),
    ).toBeTruthy()
    expect(within(region).queryByRole('button', { name: /registry snippet/i })).toBeNull()
    expect(region.textContent).not.toMatch(/archivePuzzles|PUZZLE_IDS|puzzleIds|offsetDays|\bSCHEDULE\b|[Rr]egistry|Save as|Manual developer integration/)
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

async function openReadyFinalPuzzle(publisher: PublishingClient, cardIndex = 0, production: ProductionClient | null = null) {
  const user = await setup(publisher, production)
  await fillInputs(user)
  await generate(user)
  await approve(user, cardIndex)
  await user.clear(screen.getByLabelText('Puzzle ID'))
  await user.type(screen.getByLabelText('Puzzle ID'), 'workshopdogs')
  return user
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const IRREVERSIBLE = 'Published puzzles can’t be edited, rescheduled, or removed in v1.'

describe('WorkshopApp publishing: preview', () => {
  it('offers Publish only for a valid Final Puzzle, above Developer export, with a labeled estimate', async () => {
    const publisher = fakePublisher()
    const user = await setup(publisher)
    await fillInputs(user)
    await generate(user)
    await approve(user, 0)

    // The suggested id "dogs" is reserved: not locally valid.
    expect(screen.queryByRole('heading', { name: 'Publish to dev calendar (testing)' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Publish to Dev Calendar' })).toBeNull()

    await user.clear(screen.getByLabelText('Puzzle ID'))
    await user.type(screen.getByLabelText('Puzzle ID'), 'workshopdogs')
    expect(await screen.findByText('Expected: Scheduled for October 4, 2026')).toBeTruthy()
    expect(screen.getByText('Releases October 3 at 10:00 PM ET.')).toBeTruthy()
    expect(screen.getByText('Estimate only. The final date is assigned when you publish.')).toBeTruthy()

    const publishHeading = screen.getByRole('heading', { name: 'Publish to dev calendar (testing)' })
    const exportHeading = screen.getByRole('heading', { name: 'Developer export' })
    expect(publishHeading.compareDocumentPosition(exportHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download workshopdogsPuzzle.ts' })).toBeTruthy()

    const lastRequest = publisher.preview.mock.calls.at(-1)![0]
    expect(lastRequest).toMatchObject({ id: 'workshopdogs', clue: 'Dogs' })
    expect(lastRequest.construction.ok).toBe(true)
  })

  it('formats dates without shifting in non-Eastern machine timezones', async () => {
    vi.stubEnv('TZ', 'Pacific/Kiritimati')
    await openReadyFinalPuzzle(fakePublisher())
    expect(await screen.findByText('Expected: Scheduled for October 4, 2026')).toBeTruthy()
    expect(screen.getByText('Releases October 3 at 10:00 PM ET.')).toBeTruthy()
  })

  it('refreshes the debounced preview when the ID or clue changes', async () => {
    const publisher = fakePublisher()
    const user = await openReadyFinalPuzzle(publisher)
    await screen.findByText('Expected: Scheduled for October 4, 2026')
    const callsBefore = publisher.preview.mock.calls.length

    await user.type(screen.getByLabelText('Clue'), ' Breeds')
    await waitFor(() => expect(publisher.preview.mock.calls.at(-1)![0].clue).toBe('Dogs Breeds'))
    // Seven keystrokes, far fewer requests.
    expect(publisher.preview.mock.calls.length - callsBefore).toBeLessThan(3)
  })

  it('reports an existing publication of the same content and confirms it without a new publication', async () => {
    const publisher = fakePublisher({
      preview: async (request) => ({ ok: true, body: { status: 'existing', publication: publicationOf(request) } }),
      publish: async (request) => ({ ok: true, body: { status: 'existing', publication: publicationOf(request) } }),
    })
    const user = await openReadyFinalPuzzle(publisher)
    expect(await screen.findByText('Already scheduled for October 4, 2026.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Publish to Dev Calendar' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Confirm Existing Publication' }))
    expect(screen.queryByRole('group', { name: /Publish “/ })).toBeNull() // no confirmation for a no-op
    expect(publisher.publish).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Already scheduled for October 4, 2026')).toBeTruthy()
    expect(screen.getByLabelText('Puzzle ID').hasAttribute('readonly')).toBe(true)
  })

  it('surfaces a same-ID conflict before publishing and blocks Publish', async () => {
    const publisher = fakePublisher({
      preview: async () => ({
        ok: true,
        body: {
          status: 'conflict',
          message: 'server text',
          existing: { puzzleId: 'workshopdogs', publishDate: '2026-10-09', releaseInstant: '2026-10-09T02:00:00.000Z' },
        },
      }),
    })
    await openReadyFinalPuzzle(publisher)
    expect(
      await screen.findByText(
        'Puzzle ID “workshopdogs” is already scheduled for October 9, 2026 with different content. Published puzzles can’t be changed; choose a new ID.',
      ),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish to Dev Calendar' })).toHaveProperty('disabled', true)
  })

  it('makes not-configured unmistakable and never looks published', async () => {
    const publisher = notConfiguredPublisher()
    await openReadyFinalPuzzle(publisher)
    expect(await screen.findByText(/Publishing isn’t configured on this Workshop server/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish to Dev Calendar' })).toHaveProperty('disabled', true)
    expect(screen.queryByText(/Scheduled for/)).toBeNull()
    expect(screen.getByLabelText('Puzzle ID').hasAttribute('readonly')).toBe(false)
  })
})

describe('WorkshopApp publishing: confirm and publish', () => {
  it('asks for confirmation; Cancel sends nothing and returns focus', async () => {
    const publisher = fakePublisher()
    const user = await openReadyFinalPuzzle(publisher)
    await screen.findByText('Expected: Scheduled for October 4, 2026')

    await user.click(screen.getByRole('button', { name: 'Publish to Dev Calendar' }))
    const confirm = screen.getByRole('group', { name: 'Publish “Dogs” for October 4, 2026?' })
    expect(within(confirm).getByText(/That date is an estimate; the server assigns the final date/)).toBeTruthy()
    expect(within(confirm).getByText(new RegExp(IRREVERSIBLE))).toBeTruthy()
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }))

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: /Publish “/ })).toBeNull()
    expect(publisher.publish).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Publish to Dev Calendar' })))
  })

  it('publishes exactly once despite a rapid double submit, shows Publishing…, then Scheduled and locks', async () => {
    const pending = deferred<ClientResult<PublishResponseBody>>()
    const publisher = fakePublisher({ publish: () => pending.promise })
    const user = await openReadyFinalPuzzle(publisher)
    await screen.findByText('Expected: Scheduled for October 4, 2026')
    await user.click(screen.getByRole('button', { name: 'Publish to Dev Calendar' }))

    const confirmButton = within(screen.getByRole('group', { name: /Publish “Dogs”/ })).getByRole('button', { name: 'Publish' })
    // Two clicks before React can re-render the disabled button: only the ref guard stops the second.
    act(() => {
      confirmButton.click()
      confirmButton.click()
    })
    expect(publisher.publish).toHaveBeenCalledTimes(1)
    const publishing = screen.getByRole('button', { name: 'Publishing…' })
    expect(publishing).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true)

    await act(async () => {
      pending.resolve({ ok: true, body: { status: 'created', publication: publicationOf(publisher.publish.mock.calls[0][0]) } })
    })
    expect(screen.getByText('Scheduled for October 4, 2026')).toBeTruthy()
    expect(screen.getByText('Releases October 3 at 10:00 PM ET.')).toBeTruthy()
    expect(screen.getByLabelText('Puzzle ID').hasAttribute('readonly')).toBe(true)
    expect(screen.getByLabelText('Clue').hasAttribute('readonly')).toBe(true)
    expect(screen.getByText('Published: the ID and clue are locked.')).toBeTruthy()
    expect(publisher.publish).toHaveBeenCalledTimes(1)
    expect(publisher.publish.mock.calls[0][0]).toMatchObject({ id: 'workshopdogs', clue: 'Dogs' })

    // Developer export is still available after publishing.
    expect(screen.getByRole('button', { name: 'Download workshopdogsPuzzle.ts' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download workshopdogsPuzzleLayout.ts' })).toBeTruthy()
  })

  it('shows an idempotent existing result as success and locks', async () => {
    const publisher = fakePublisher({
      publish: async (request) => ({ ok: true, body: { status: 'existing', publication: publicationOf(request) } }),
    })
    const user = await openReadyFinalPuzzle(publisher)
    await screen.findByText('Expected: Scheduled for October 4, 2026')
    await user.click(screen.getByRole('button', { name: 'Publish to Dev Calendar' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Already scheduled for October 4, 2026')).toBeTruthy()
    expect(screen.getByLabelText('Clue').hasAttribute('readonly')).toBe(true)
  })

  async function publishWith(body: PublishResponseBody | null) {
    const publisher = fakePublisher({
      publish: async () => (body ? { ok: true, body } : { ok: false, failure: 'network' }),
    })
    const user = await openReadyFinalPuzzle(publisher)
    await screen.findByText('Expected: Scheduled for October 4, 2026')
    await user.click(screen.getByRole('button', { name: 'Publish to Dev Calendar' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    return publisher
  }

  it('shows a conflict from publish without locking', async () => {
    await publishWith({
      status: 'conflict',
      message: 'server text',
      existing: { puzzleId: 'workshopdogs', publishDate: '2026-10-09', releaseInstant: '2026-10-09T02:00:00.000Z' },
    })
    expect(
      await screen.findByText(
        'Puzzle ID “workshopdogs” is already scheduled for October 9, 2026 with different content. Published puzzles can’t be changed; choose a new ID.',
      ),
    ).toBeTruthy()
    expect(screen.getByLabelText('Puzzle ID').hasAttribute('readonly')).toBe(false)
  })

  it('shows server-side validation errors', async () => {
    await publishWith({
      status: 'invalid',
      errors: { metadata: [{ field: 'id', message: 'Puzzle ID is required.' }], production: ['Cell r0c0 has no letter.'], export: ['Geometry invariant violated.'] },
    })
    expect(await screen.findByText('The publishing server rejected this puzzle:')).toBeTruthy()
    for (const text of ['Cell r0c0 has no letter.', 'Geometry invariant violated.']) expect(screen.getByText(text)).toBeTruthy()
  })

  it('shows busy as retryable', async () => {
    await publishWith({ status: 'busy', message: 'server text' })
    expect(await screen.findByText('Publishing is busy. Nothing was published; try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Publish to Dev Calendar' })).toHaveProperty('disabled', false)
  })

  it('shows unavailable and not-configured outcomes without implying success', async () => {
    await publishWith({ status: 'unavailable', message: 'Publishing is unavailable right now. Nothing was published; try again.' })
    expect(await screen.findByText('Publishing is unavailable right now. Nothing was published; try again.')).toBeTruthy()
    expect(screen.queryByText(/^Scheduled for/)).toBeNull()
    cleanup()

    await publishWith(NOT_CONFIGURED)
    expect(await screen.findAllByText(/Publishing isn’t configured on this Workshop server/)).toHaveLength(1)
    expect(screen.getByLabelText('Puzzle ID').hasAttribute('readonly')).toBe(false)
  })

  it('explains that an interrupted request is safe to retry', async () => {
    await publishWith(null)
    expect(await screen.findByText(/may or may not have been published\. Publishing again is safe/)).toBeTruthy()
  })

  it('confirms without a date when the preview could not be loaded', async () => {
    const publisher = fakePublisher({ preview: async () => ({ ok: false, failure: 'network' }) })
    const user = await openReadyFinalPuzzle(publisher)
    expect(await screen.findByText('Couldn’t check the publishing schedule right now.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publish to Dev Calendar' }))
    expect(screen.getByRole('group', { name: 'Publish “Dogs”?' })).toBeTruthy()
  })
})

describe('WorkshopApp publishing: session state', () => {
  it('keeps the published, locked state through Back and reopen; another candidate starts editable', async () => {
    const publisher = fakePublisher()
    const user = await openReadyFinalPuzzle(publisher, 3)
    await screen.findByText('Expected: Scheduled for October 4, 2026')
    await user.click(screen.getByRole('button', { name: 'Publish to Dev Calendar' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await screen.findByText('Scheduled for October 4, 2026')

    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    await user.click(screen.getByRole('button', { name: 'Open Final Puzzle' }))
    expect(screen.getByText('Scheduled for October 4, 2026')).toBeTruthy()
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('workshopdogs')
    expect(screen.getByLabelText('Puzzle ID').hasAttribute('readonly')).toBe(true)
    const previewCalls = publisher.preview.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    await approve(user, 7)
    expect(screen.getByLabelText('Puzzle ID').hasAttribute('readonly')).toBe(false)
    expect(screen.getByLabelText('Clue').hasAttribute('readonly')).toBe(false)
    expect(screen.queryByText('Scheduled for October 4, 2026')).toBeNull()
    expect(publisher.publish).toHaveBeenCalledTimes(1)
    expect(publisher.preview.mock.calls.length).toBe(previewCalls) // "dogs" is invalid locally: no preview
  })
})

// ---- Production operations (npm run workshop:production-ops) -------------

const PRODUCTION_FINGERPRINT = '1'.repeat(64)

function defaultProductionFakes() {
  return {
    schedule: vi.fn<ProductionClient['schedule']>(async () => ({
      ok: true,
      body: { status: 'ok', schedule: { asOf: '2026-10-06T16:00:00.000Z', entries: [], summary: { currentDate: null, lastScheduledDate: null, scheduledCount: 0, filledThrough: null, daysAhead: 0, gaps: [] } } },
    })),
    previewPublish: vi.fn<ProductionClient['previewPublish']>(async () => ({
      ok: true,
      body: { status: 'estimate', estimate: { publishDate: '2026-10-07', releaseInstant: '2026-10-07T02:00:00.000Z', contentFingerprint: PRODUCTION_FINGERPRINT } },
    })),
    publish: vi.fn<ProductionClient['publish']>(async ({ request }) => ({
      ok: true,
      body: {
        status: 'created',
        publication: { puzzleId: request.id, publishDate: '2026-10-07', releaseInstant: '2026-10-07T02:00:00.000Z', contentFingerprint: PRODUCTION_FINGERPRINT, fingerprintVersion: 1 },
      },
    })),
    previewRemoval: vi.fn<ProductionClient['previewRemoval']>(async () => ({ ok: true, body: { status: 'not-found' } })),
    remove: vi.fn<ProductionClient['remove']>(async () => ({ ok: true, body: { status: 'not-found' } })),
  }
}

function fakeProduction(overrides: Partial<ReturnType<typeof defaultProductionFakes>> = {}) {
  return { ...defaultProductionFakes(), ...overrides }
}

const productionRegion = () => screen.getByRole('heading', { name: 'Publish to Production' }).nextElementSibling as HTMLElement

describe('WorkshopApp Production operations', () => {
  it('plain Workshop shows no Production banner, schedule, or publish section', async () => {
    const user = await openReadyFinalPuzzle(fakePublisher())
    await screen.findByText(/Expected: Scheduled for/)
    expect(screen.queryByText(/Production Operations Enabled/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Production Schedule' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Publish to Production' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Publish to dev calendar (testing)' })).toBeTruthy()
    void user
  })

  it('shows the banner and schedule navigation, keeping authoring state across views', async () => {
    const production = fakeProduction()
    const user = await openReadyFinalPuzzle(fakePublisher(), 0, production)
    expect(screen.getByText(/Production Operations Enabled/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Production Schedule' }))
    expect(await screen.findByRole('heading', { name: 'Production Schedule' })).toBeTruthy()
    expect(production.schedule).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Authoring' }))
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('workshopdogs')
  })

  it('previews only on request, then publishes the exact approved request once with the previewed fingerprint and typed ID', async () => {
    const publisher = fakePublisher()
    const production = fakeProduction()
    const user = await openReadyFinalPuzzle(publisher, 0, production)
    await screen.findByText(/Expected: Scheduled for/)
    expect(production.previewPublish).not.toHaveBeenCalled() // never automatic

    await user.click(within(productionRegion()).getByRole('button', { name: 'Production Preview' }))
    const region = productionRegion()
    await within(region).findByText('Next Production date')
    expect(within(region).getByText('October 7, 2026')).toBeTruthy()
    expect(within(region).getByText(PRODUCTION_FINGERPRINT)).toBeTruthy()
    const devRequest = publisher.preview.mock.calls.at(-1)![0]
    expect(production.previewPublish.mock.calls[0][0]).toEqual(devRequest) // the same approved content

    const publishButton = within(region).getByRole('button', { name: 'Publish to Production' })
    expect(publishButton).toHaveProperty('disabled', true)
    await user.type(within(region).getByLabelText(/Type the puzzle ID/), 'workshopdog')
    expect(publishButton).toHaveProperty('disabled', true)
    await user.type(within(region).getByLabelText(/Type the puzzle ID/), 's')
    await user.dblClick(publishButton)

    expect(await screen.findByText(/Published to Production/)).toBeTruthy()
    expect(production.publish).toHaveBeenCalledTimes(1)
    expect(production.publish.mock.calls[0][0]).toEqual({ request: devRequest, expectedFingerprint: PRODUCTION_FINGERPRINT, confirmPuzzleId: 'workshopdogs' })
    expect(publisher.publish).not.toHaveBeenCalled() // dev publishing untouched
  })

  it('discards the preview when the puzzle inputs change', async () => {
    const production = fakeProduction()
    const user = await openReadyFinalPuzzle(fakePublisher(), 0, production)
    await user.click(within(productionRegion()).getByRole('button', { name: 'Production Preview' }))
    await within(productionRegion()).findByText('Next Production date')
    await user.type(screen.getByLabelText('Clue'), ' Breeds')
    await waitFor(() => expect(within(productionRegion()).queryByText('Next Production date')).toBeNull())
    expect(within(productionRegion()).queryByRole('button', { name: 'Publish to Production' })).toBeNull()
  })

  it('explains changed content and uncertain outcomes without claiming success', async () => {
    const production = fakeProduction({
      publish: vi
        .fn<ProductionClient['publish']>()
        .mockResolvedValueOnce({ ok: true, body: { status: 'content-changed', message: 'This puzzle changed since the Production preview. Nothing was published; preview again.', contentFingerprint: '2'.repeat(64) } })
        .mockResolvedValueOnce({ ok: false }),
    })
    const user = await openReadyFinalPuzzle(fakePublisher(), 0, production)
    const previewAndPublish = async () => {
      await user.click(within(productionRegion()).getByRole('button', { name: /Production Preview|Preview Again/ }))
      await within(productionRegion()).findByText('Next Production date')
      await user.type(within(productionRegion()).getByLabelText(/Type the puzzle ID/), 'workshopdogs')
      await user.click(within(productionRegion()).getByRole('button', { name: 'Publish to Production' }))
    }
    await previewAndPublish()
    expect(await screen.findByText(/changed since the Production preview/)).toBeTruthy()
    await previewAndPublish()
    expect(await screen.findByText(/may or may not have been published/)).toBeTruthy()
    expect(screen.queryByText(/Published to Production/)).toBeNull()
  })

  it('the dev Publish button never reaches Production', async () => {
    const publisher = fakePublisher()
    const production = fakeProduction()
    const user = await openReadyFinalPuzzle(publisher, 0, production)
    await screen.findByText(/Expected: Scheduled for/)
    await user.click(screen.getByRole('button', { name: 'Publish to Dev Calendar' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(publisher.publish).toHaveBeenCalledTimes(1))
    expect(production.publish).not.toHaveBeenCalled()
    expect(production.previewPublish).not.toHaveBeenCalled()
  })
})
