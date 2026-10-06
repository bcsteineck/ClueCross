// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductionRemoveBody, Schedule, ScheduleEntry } from './production/contract'
import type { ProductionClient } from './production/productionClient'
import { ProductionSchedule } from './ProductionSchedule'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const entry = (puzzleId: string, clue: string, publishDate: string, status: ScheduleEntry['status'], releaseInstant: string): ScheduleEntry => ({
  puzzleId,
  clue,
  publishDate,
  releaseInstant,
  contentFingerprint: `${puzzleId.length}`.repeat(64),
  status,
  removable: status === 'scheduled',
})

const SCHEDULE: Schedule = {
  asOf: '2026-10-06T16:00:00.000Z',
  entries: [
    entry('colors', 'Colors', '2026-10-05', 'released', '2026-10-05T02:00:00.000Z'),
    entry('outerspace', 'Outer Space', '2026-10-06', 'current', '2026-10-06T02:00:00.000Z'),
    entry('animals', 'Animals', '2026-10-07', 'scheduled', '2026-10-07T02:00:00.000Z'),
    entry('movies', 'Movies', '2026-10-08', 'scheduled', '2026-10-08T02:00:00.000Z'),
  ],
  summary: { currentDate: '2026-10-06', lastScheduledDate: '2026-10-08', scheduledCount: 2, filledThrough: '2026-10-08', daysAhead: 2, gaps: [] },
}

function fakeClient(overrides: Partial<ProductionClient> = {}) {
  return {
    schedule: vi.fn<ProductionClient['schedule']>(async () => ({ ok: true, body: { status: 'ok', schedule: SCHEDULE } })),
    previewPublish: vi.fn<ProductionClient['previewPublish']>(),
    publish: vi.fn<ProductionClient['publish']>(),
    previewRemoval: vi.fn<ProductionClient['previewRemoval']>(async () => ({
      ok: true,
      body: {
        status: 'removable',
        target: SCHEDULE.entries[2],
        moves: [{ puzzleId: 'movies', clue: 'Movies', from: '2026-10-08', to: '2026-10-07' }],
      },
    })),
    remove: vi.fn<ProductionClient['remove']>(async () => ({
      ok: true,
      body: { status: 'removed', removed: SCHEDULE.entries[2], moves: [{ puzzleId: 'movies', clue: 'Movies', from: '2026-10-08', to: '2026-10-07' }] },
    })),
    ...overrides,
  }
}

const row = (text: string) => screen.getByRole('cell', { name: new RegExp(text) }).closest('tr') as HTMLElement

describe('Production Schedule', () => {
  it('reads the schedule once and shows statuses, release times, and a summary', async () => {
    const client = fakeClient()
    render(<ProductionSchedule client={client} />)
    expect(await screen.findByText('Outer Space')).toBeTruthy()
    expect(client.schedule).toHaveBeenCalledTimes(1)

    expect(within(row('Colors')).getByText('Released')).toBeTruthy()
    expect(within(row('Outer Space')).getByText('Current')).toBeTruthy()
    expect(within(row('Animals')).getByText('Scheduled')).toBeTruthy()
    expect(within(row('Animals')).getByText('October 6 at 10:00 PM ET')).toBeTruthy()
    expect(screen.getByText('October 8, 2026 (2 days ahead)')).toBeTruthy()
    expect(screen.getByText('None')).toBeTruthy() // no gaps

    // Only scheduled rows can be removed.
    expect(within(row('Colors')).queryByRole('button')).toBeNull()
    expect(within(row('Outer Space')).queryByRole('button')).toBeNull()
    expect(within(row('Animals')).getByRole('button', { name: /Remove Animals/ })).toBeTruthy()

    // No polling: only an explicit Refresh reads again.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(client.schedule).toHaveBeenCalledTimes(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(client.schedule).toHaveBeenCalledTimes(2))
  })

  it('shows gaps and failures', async () => {
    const withGap = { ...SCHEDULE, summary: { ...SCHEDULE.summary, gaps: ['2026-10-04'] } }
    const client = fakeClient({
      schedule: vi
        .fn<ProductionClient['schedule']>()
        .mockResolvedValueOnce({ ok: true, body: { status: 'production-unavailable', reason: 'identity', message: 'Could not verify the Production calendar.' } })
        .mockResolvedValueOnce({ ok: true, body: { status: 'ok', schedule: withGap } }),
    })
    const user = userEvent.setup()
    render(<ProductionSchedule client={client} />)
    expect(await screen.findByText('Could not verify the Production calendar.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('October 4, 2026')).toBeTruthy()
  })

  it('previews the backfill, requires the typed ID, removes with the previewed guards, then refreshes', async () => {
    const client = fakeClient()
    const user = userEvent.setup()
    render(<ProductionSchedule client={client} />)
    await user.click(await screen.findByRole('button', { name: /Remove Animals/ }))
    expect(client.previewRemoval).toHaveBeenCalledWith('animals')

    const panel = screen.getByRole('group', { name: 'Remove from Schedule' })
    expect(await within(panel).findByText(/Removing: Animals \(animals\) — October 7, 2026/)).toBeTruthy()
    expect(within(panel).getByText('Movies (movies): October 8, 2026 → October 7, 2026')).toBeTruthy()
    expect(within(panel).getByText(/Released puzzles will not change/)).toBeTruthy()

    const confirm = within(panel).getByRole('button', { name: 'Remove from Schedule' })
    expect(confirm).toHaveProperty('disabled', true)
    await user.type(within(panel).getByLabelText(/Type the puzzle ID/), 'animals')
    await user.click(confirm)

    expect(await within(panel).findByText(/Removed Animals \(animals\)/)).toBeTruthy()
    expect(within(panel).getByText(/1 later puzzle moved forward one day/)).toBeTruthy()
    expect(client.remove).toHaveBeenCalledTimes(1)
    expect(client.remove).toHaveBeenCalledWith({
      puzzleId: 'animals',
      expectedPublishDate: '2026-10-07',
      expectedFingerprint: SCHEDULE.entries[2].contentFingerprint,
      confirmPuzzleId: 'animals',
    })
    await waitFor(() => expect(client.schedule).toHaveBeenCalledTimes(2)) // refreshed
  })

  it.each<[string, ProductionRemoveBody | null, RegExp]>([
    ['stale', { status: 'stale', current: { ...SCHEDULE.entries[2], publishDate: '2026-10-06' } }, /schedule changed since the preview/],
    ['released', { status: 'released', target: SCHEDULE.entries[2] }, /has released and can no longer be removed/],
    ['not-found', { status: 'not-found' }, /may already have been removed/],
    ['uncertain', { status: 'production-unavailable', reason: 'uncertain', message: 'x' }, /may or may not have been removed/],
    ['no response', null, /may or may not have been removed/],
  ])('reports a %s removal result and refreshes', async (_label, body, message) => {
    const client = fakeClient({ remove: vi.fn<ProductionClient['remove']>(async () => (body ? { ok: true, body } : { ok: false })) })
    const user = userEvent.setup()
    render(<ProductionSchedule client={client} />)
    await user.click(await screen.findByRole('button', { name: /Remove Animals/ }))
    const panel = screen.getByRole('group', { name: 'Remove from Schedule' })
    await user.type(await within(panel).findByLabelText(/Type the puzzle ID/), 'animals')
    await user.click(within(panel).getByRole('button', { name: 'Remove from Schedule' }))
    expect(await within(panel).findByText(message)).toBeTruthy()
    await waitFor(() => expect(client.schedule).toHaveBeenCalledTimes(2))
  })

  it('reports a puzzle that released before the preview, without offering removal', async () => {
    const client = fakeClient({
      previewRemoval: vi.fn<ProductionClient['previewRemoval']>(async () => ({ ok: true, body: { status: 'released', target: SCHEDULE.entries[2] } })),
    })
    const user = userEvent.setup()
    render(<ProductionSchedule client={client} />)
    await user.click(await screen.findByRole('button', { name: /Remove Animals/ }))
    const panel = screen.getByRole('group', { name: 'Remove from Schedule' })
    expect(await within(panel).findByText(/has released and can no longer be removed/)).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Remove from Schedule' })).toBeNull()
    expect(client.remove).not.toHaveBeenCalled()
  })
})
