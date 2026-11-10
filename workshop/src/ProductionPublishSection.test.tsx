// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConstructionSuccess } from '../../tools/generator/src/types.js'
import type { ProductionBackfillBody, ProductionBackfillPreviewBody } from './production/contract'
import type { ProductionClient, ProductionResult } from './production/productionClient'
import { ProductionPublishSection } from './ProductionPublishSection'
import type { PublishRequest } from './publishing/contract'

const FINGERPRINT = 'b'.repeat(64)

// CAT across crossing TIE down.
const construction: ConstructionSuccess = {
  ok: true,
  placedAnswers: [
    { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
    { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
  ],
  cells: { r0c0: 'C', r0c1: 'A', r0c2: 'T', r1c2: 'I', r2c2: 'E' },
  positions: { r0c0: { x: 0, y: 0 }, r0c1: { x: 1, y: 0 }, r0c2: { x: 2, y: 0 }, r1c2: { x: 2, y: 1 }, r2c2: { x: 2, y: 2 } },
  width: 3,
  height: 3,
  attemptsUsed: 1,
}
const REQUEST: PublishRequest = { construction, id: 'cats', clue: 'Cats' }

// The November 8, 2026 puzzle released November 7 at 10 PM EST.
const NOV_8 = { publishDate: '2026-11-08', releaseInstant: '2026-11-08T03:00:00.000Z' }
const NOV_2 = { publishDate: '2026-11-02', releaseInstant: '2026-11-02T03:00:00.000Z' }

const missed = (dates = [NOV_2, NOV_8]): ProductionResult<ProductionBackfillPreviewBody> => ({
  ok: true,
  body: { status: 'missed-dates', contentFingerprint: FINGERPRINT, firstPublishDate: '2026-11-01', dates },
})

const created: ProductionResult<ProductionBackfillBody> = {
  ok: true,
  body: {
    status: 'created',
    publication: { puzzleId: 'cats', publishDate: '2026-11-08', releaseInstant: NOV_8.releaseInstant, contentFingerprint: FINGERPRINT, fingerprintVersion: 1 },
  },
}

function fakeClient(overrides: Partial<ProductionClient> = {}): ProductionClient {
  return {
    schedule: vi.fn(),
    previewPublish: vi.fn(),
    publish: vi.fn(),
    previewBackfill: vi.fn<ProductionClient['previewBackfill']>(async () => missed()),
    backfill: vi.fn<ProductionClient['backfill']>(async () => created),
    previewRemoval: vi.fn(),
    remove: vi.fn(),
    previewPuzzle: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv('TZ', 'America/Los_Angeles') // the browser's zone, for the "your time" lines
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function openMissedDates(client: ProductionClient) {
  const user = userEvent.setup()
  render(<ProductionPublishSection request={REQUEST} client={client} />)
  await user.click(screen.getByRole('radio', { name: 'A missed past date' }))
  return user
}

describe('Production publishing: date mode', () => {
  it('defaults to the unchanged next-available-date flow and checks nothing automatically', () => {
    const client = fakeClient()
    render(<ProductionPublishSection request={REQUEST} client={client} />)
    expect((screen.getByRole('radio', { name: 'Next available date' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Production Preview' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Find Missed Dates' })).toBeNull()
    expect(client.previewPublish).not.toHaveBeenCalled()
    expect(client.previewBackfill).not.toHaveBeenCalled()
  })

  it('switching modes discards the other mode’s state', async () => {
    const client = fakeClient()
    const user = await openMissedDates(client)
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    expect(await screen.findByRole('radio', { name: /November 8, 2026/ })).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: 'Next available date' }))
    await user.click(screen.getByRole('radio', { name: 'A missed past date' }))
    expect(screen.queryByRole('radio', { name: /November 8, 2026/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Find Missed Dates' })).toBeTruthy()
  })
})

describe('Production publishing: a missed past date', () => {
  it('lists only the server’s missed dates, with the release cutoff in Eastern and local time', async () => {
    const client = fakeClient()
    const user = await openMissedDates(client)
    expect(client.previewBackfill).not.toHaveBeenCalled() // never automatic
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))

    expect(client.previewBackfill).toHaveBeenCalledWith(REQUEST)
    const group = await screen.findByRole('group', { name: 'Missed date' })
    expect(within(group).getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      expect.stringContaining('November 2, 2026'),
      expect.stringContaining('November 8, 2026'),
    ])
    expect(within(group).getByText('Released November 7 at 10:00 PM ET (November 7 at 7:00 PM PST, your time)')).toBeTruthy()
    expect(within(group).getByText(/Only dates with no puzzle whose release time has passed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Publish to/ })).toBeNull() // nothing until a date is chosen
  })

  it('shows the confirmation prominently and requires the exact typed puzzle ID', async () => {
    const client = fakeClient()
    const user = await openMissedDates(client)
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    await user.click(await screen.findByRole('radio', { name: /November 8, 2026/ }))

    const confirm = screen.getByRole('group', { name: 'Publish to a missed date' })
    const fact = (term: string) => within(confirm).getByText(term).nextElementSibling?.textContent
    expect(fact('Puzzle ID')).toBe('cats')
    expect(fact('Clue')).toBe('Cats')
    expect(fact('Missed date')).toBe('November 8, 2026')
    expect(fact('Release time (Eastern)')).toBe('November 7 at 10:00 PM ET, the evening before')
    expect(fact('Your time')).toBe('November 7 at 7:00 PM PST')
    expect(within(confirm).getByText('This puzzle becomes public immediately.')).toBeTruthy()

    const button = within(confirm).getByRole('button', { name: 'Publish to November 8, 2026' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    const input = within(confirm).getByLabelText('Type the puzzle ID (cats) to confirm')
    await user.type(input, 'Cats')
    expect(button.disabled).toBe(true)
    await user.clear(input)
    await user.type(input, 'cats')
    expect(button.disabled).toBe(false)
  })

  it('publishes the exact request to the chosen date once, then shows the released outcome', async () => {
    let finish: (value: ProductionResult<ProductionBackfillBody>) => void = () => {}
    const client = fakeClient({ backfill: vi.fn<ProductionClient['backfill']>(() => new Promise((resolve) => (finish = resolve))) })
    const user = await openMissedDates(client)
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    await user.click(await screen.findByRole('radio', { name: /November 8, 2026/ }))
    await user.type(screen.getByLabelText('Type the puzzle ID (cats) to confirm'), 'cats')

    const button = screen.getByRole('button', { name: 'Publish to November 8, 2026' })
    await user.click(button)
    expect(screen.getByRole('button', { name: 'Publishing to Production…' })).toHaveProperty('disabled', true)
    await user.click(screen.getByRole('button', { name: 'Publishing to Production…' })) // a second click does nothing
    expect(client.backfill).toHaveBeenCalledTimes(1)
    expect(client.backfill).toHaveBeenCalledWith({
      request: REQUEST,
      publishDate: '2026-11-08',
      expectedFingerprint: FINGERPRINT,
      confirmPuzzleId: 'cats',
    })

    finish(created)
    const outcome = await screen.findByText(/Published to Production and released/)
    expect(outcome.textContent).toContain('“Cats” (cats) — November 8, 2026')
    expect(screen.getByText(/has already passed, so players can open it now/).textContent).toContain(
      'November 7 at 10:00 PM ET (November 7 at 7:00 PM PST, your time)',
    )
    expect(screen.queryByRole('button', { name: /Publish to/ })).toBeNull() // no way to submit again
  })

  it('explains empty states: no history, and nothing missed', async () => {
    const noHistory = fakeClient({
      previewBackfill: vi.fn(async () => ({
        ok: true as const,
        body: { status: 'missed-dates' as const, contentFingerprint: FINGERPRINT, firstPublishDate: null, dates: [] },
      })),
    })
    let user = await openMissedDates(noHistory)
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    expect(await screen.findByText(/Nothing has been published to Production yet/)).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Missed date' })).toBeNull()
    cleanup()

    user = await openMissedDates(fakeClient({ previewBackfill: vi.fn(async () => missed([])) }))
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    expect((await screen.findByText('No missed dates.')).parentElement?.textContent).toMatch(/Every date from November 1, 2026/)
    expect(screen.queryByRole('group', { name: 'Missed date' })).toBeNull()
  })

  it('explains the remove-then-backfill workflow when the puzzle is already scheduled', async () => {
    const client = fakeClient({
      previewBackfill: vi.fn(async () => ({
        ok: true as const,
        body: {
          status: 'existing' as const,
          publication: { puzzleId: 'cats', publishDate: '2026-11-09', releaseInstant: '2026-11-09T03:00:00.000Z', contentFingerprint: FINGERPRINT, fingerprintVersion: 1 as const },
        },
      })),
    })
    const user = await openMissedDates(client)
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    const message = await screen.findByText(/Already in the Production schedule for November 9, 2026/)
    expect(message.parentElement?.textContent).toMatch(/remove it in the Production Schedule first/)
    expect(screen.queryByRole('group', { name: 'Missed date' })).toBeNull()
  })

  it('reports an ineligible date without claiming success, and asks for a fresh check', async () => {
    const client = fakeClient({
      backfill: vi.fn(async () => ({
        ok: true as const,
        body: { status: 'ineligible' as const, publishDate: '2026-11-08', reason: 'occupied' as const, message: 'server text' },
      })),
    })
    const user = await openMissedDates(client)
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    await user.click(await screen.findByRole('radio', { name: /November 8, 2026/ }))
    await user.type(screen.getByLabelText('Type the puzzle ID (cats) to confirm'), 'cats')
    await user.click(screen.getByRole('button', { name: 'Publish to November 8, 2026' }))

    const problem = await screen.findByText(/Nothing was published\. November 8, 2026 already has a puzzle\./)
    expect(problem.textContent).toMatch(/Find missed dates again/)
    expect(screen.queryByText(/Published to Production and released/)).toBeNull()
    expect(screen.queryByRole('group', { name: 'Missed date' })).toBeNull() // the stale list is gone
    expect(screen.getByRole('button', { name: 'Find Missed Dates' })).toBeTruthy()
  })

  it('treats a lost response as uncertain, and a failed check as unreachable', async () => {
    const client = fakeClient({ backfill: vi.fn(async () => ({ ok: false as const })) })
    const user = await openMissedDates(client)
    await user.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    await user.click(await screen.findByRole('radio', { name: /November 8, 2026/ }))
    await user.type(screen.getByLabelText('Type the puzzle ID (cats) to confirm'), 'cats')
    await user.click(screen.getByRole('button', { name: 'Publish to November 8, 2026' }))
    expect(await screen.findByText(/may or may not have been published\. Check the Production Schedule/)).toBeTruthy()
    cleanup()

    const down = await openMissedDates(fakeClient({ previewBackfill: vi.fn(async () => ({ ok: false as const })) }))
    await down.click(screen.getByRole('button', { name: 'Find Missed Dates' }))
    expect(await screen.findByText('Couldn’t reach the Production operations server.')).toBeTruthy()
  })
})
