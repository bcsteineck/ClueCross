// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProductionPuzzlePreviewBody, PuzzlePreview, Schedule, ScheduleEntry } from './production/contract'
import type { ProductionClient, ProductionResult } from './production/productionClient'
import { createPuzzlePreviewCache } from './production/puzzlePreviewCache'
import { ProductionSchedule } from './ProductionSchedule'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const entry = (puzzleId: string, clue: string, publishDate: string, status: ScheduleEntry['status'], fingerprint: string): ScheduleEntry => ({
  puzzleId,
  clue,
  publishDate,
  releaseInstant: `${publishDate}T02:00:00.000Z`,
  contentFingerprint: fingerprint.repeat(64),
  status,
  removable: status === 'scheduled',
})

const schedule = (entries: ScheduleEntry[]): Schedule => ({
  asOf: '2026-10-06T16:00:00.000Z',
  entries,
  summary: { currentDate: '2026-10-06', lastScheduledDate: '2026-10-07', scheduledCount: 1, filledThrough: '2026-10-07', daysAhead: 1, gaps: [], missedDates: [] },
})

const COLORS = entry('colors', 'Colors', '2026-10-05', 'released', 'a')
const SPACE = entry('outerspace', 'Outer Space', '2026-10-06', 'current', 'b')
const ZOO = entry('zoo', 'At the Zoo', '2026-10-07', 'scheduled', 'c')
const SCHEDULE = schedule([COLORS, SPACE, ZOO])

// ELEPHANT across, TIGER down from its T, RHINO across from TIGER's R.
function previewOf(item: ScheduleEntry, overrides: Partial<PuzzlePreview> = {}): PuzzlePreview {
  const cells: Record<string, string> = {}
  const positions: Record<string, { x: number; y: number }> = {}
  const place = (word: string, x: number, y: number, across: boolean) =>
    [...word].forEach((letter, i) => {
      const at = across ? { x: x + i, y } : { x, y: y + i }
      cells[`r${at.y}c${at.x}`] = letter
      positions[`r${at.y}c${at.x}`] = at
    })
  place('ELEPHANT', 0, 0, true)
  place('TIGER', 7, 0, false)
  place('RHINO', 7, 4, true)
  return {
    puzzleId: item.puzzleId,
    clue: item.clue,
    publishDate: item.publishDate,
    releaseInstant: item.releaseInstant,
    status: item.status === 'scheduled' ? 'scheduled' : 'released',
    contentFingerprint: item.contentFingerprint,
    board: { width: 12, height: 5, cells, positions },
    answers: [
      { word: 'ELEPHANT', direction: 'across' },
      { word: 'TIGER', direction: 'down' },
      { word: 'RHINO', direction: 'across' },
    ],
    ...overrides,
  }
}

const ok = (item: ScheduleEntry, overrides?: Partial<PuzzlePreview>): ProductionResult<ProductionPuzzlePreviewBody> => ({
  ok: true,
  body: { status: 'ok', preview: previewOf(item, overrides) },
})

function fakeClient(overrides: Partial<ProductionClient> = {}) {
  return {
    schedule: vi.fn<ProductionClient['schedule']>(async () => ({ ok: true, body: { status: 'ok', schedule: SCHEDULE } })),
    previewPublish: vi.fn(),
    publish: vi.fn(),
    previewBackfill: vi.fn(),
    backfill: vi.fn(),
    previewRemoval: vi.fn(),
    remove: vi.fn(),
    previewPuzzle: vi.fn<ProductionClient['previewPuzzle']>(async ({ puzzleId }) =>
      ok([COLORS, SPACE, ZOO].find((item) => item.puzzleId === puzzleId)!),
    ),
    ...overrides,
  }
}

/** A promise the test resolves by hand, to observe the loading state. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

const previewButton = (clue: string) => screen.getByRole('button', { name: new RegExp(`^Preview ${clue}`) })

async function renderSchedule(client = fakeClient(), cache = createPuzzlePreviewCache()) {
  const view = render(<ProductionSchedule client={client} previewCache={cache} />)
  await screen.findByText('At the Zoo')
  return { client, cache, view }
}

async function openPreview(clue: string) {
  const user = userEvent.setup()
  await user.click(previewButton(clue))
  const dialog = await screen.findByRole('dialog', { name: clue })
  return { user, dialog }
}

describe('Production Schedule puzzle preview', () => {
  it('offers Preview on every scheduled and released row, beside (not replacing) Remove', async () => {
    await renderSchedule()
    for (const clue of ['Colors', 'Outer Space', 'At the Zoo']) {
      expect(previewButton(clue).getAttribute('aria-haspopup')).toBe('dialog')
      expect(previewButton(clue).className).toContain('ws-button--tertiary')
    }
    expect(screen.getByRole('button', { name: /Remove At the Zoo/ }).className).toContain('ws-button--secondary')
    expect(screen.queryByRole('button', { name: /Remove Colors/ })).toBeNull()
  })

  it('opens a scheduled puzzle: loading, then the stored grid and every answer, read-only', async () => {
    const pending = deferred<ProductionResult<ProductionPuzzlePreviewBody>>()
    const client = fakeClient({ previewPuzzle: vi.fn(() => pending.promise) })
    await renderSchedule(client)
    const { dialog } = await openPreview('At the Zoo')

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(within(dialog).getByText('zoo')).toBeTruthy()
    expect(within(dialog).getByText('October 7, 2026')).toBeTruthy()
    expect(within(dialog).getByText('Scheduled')).toBeTruthy()
    expect(within(dialog).getByRole('status').textContent).toBe('Loading the puzzle from Production…')
    expect(client.previewPuzzle).toHaveBeenCalledWith({ puzzleId: 'zoo', expectedFingerprint: 'c'.repeat(64) })

    await act(async () => pending.resolve(ok(ZOO)))
    const board = within(dialog).getByRole('img', { name: 'Puzzle grid, 12 by 5, with every letter filled in.' })
    expect(board.textContent).toBe('ELEPHANTIGERHINO') // every stored cell, shared crossings once
    expect(board.querySelectorAll('.ws-board__cell')).toHaveLength(16)
    const cellAt = (x: number, y: number) =>
      [...board.querySelectorAll<HTMLElement>('.ws-board__cell')].find((cell) => cell.style.getPropertyValue('--x') === String(x + 1) && cell.style.getPropertyValue('--y') === String(y + 1))
    expect(cellAt(7, 0)?.textContent).toBe('T') // ELEPHANT × TIGER
    expect(cellAt(7, 4)?.textContent).toBe('R') // TIGER × RHINO
    expect(cellAt(0, 4)).toBeUndefined() // empty cells aren't rendered
    expect(within(dialog).getByRole('heading', { name: 'Answers (3)' })).toBeTruthy()
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['ELEPHANTAcross', 'TIGERDown', 'RHINOAcross'])
    // Read-only: nothing to type into, no Show Answers toggle, no editing.
    expect(within(dialog).queryByRole('textbox')).toBeNull()
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Close'])
  })

  it('opens a released puzzle', async () => {
    await renderSchedule()
    const { dialog } = await openPreview('Colors')
    expect(within(dialog).getByText('Released')).toBeTruthy()
    expect(await within(dialog).findByRole('img')).toBeTruthy()
    await userEvent.setup().keyboard('{Escape}')
    const current = await openPreview('Outer Space')
    expect(within(current.dialog).getByText('Released (current)')).toBeTruthy()
  })

  it('closes with Close, Escape, or the backdrop — not a click inside — and returns focus to its Preview button', async () => {
    await renderSchedule()
    let { user, dialog } = await openPreview('At the Zoo')
    expect(document.activeElement).toBe(within(dialog).getByRole('heading', { name: 'At the Zoo' }))
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(previewButton('At the Zoo'))

    ;({ user, dialog } = await openPreview('At the Zoo'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(previewButton('At the Zoo'))

    ;({ user, dialog } = await openPreview('Colors'))
    await user.click(await within(dialog).findByRole('img'))
    await user.click(within(dialog).getByRole('heading', { name: 'Answers (3)' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    await user.click(document.querySelector('.ws-modal__backdrop')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(previewButton('Colors'))
  })

  it('keeps Tab inside the dialog and makes the schedule inert and unscrollable while open', async () => {
    const { view } = await renderSchedule()
    const { user, dialog } = await openPreview('At the Zoo')
    await within(dialog).findByRole('img')
    const close = within(dialog).getByRole('button', { name: 'Close' })
    await user.tab()
    expect(document.activeElement).toBe(close)
    await user.tab()
    expect(document.activeElement).toBe(close) // the only control: Tab wraps to it
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(close)

    expect(view.container.inert).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')
    // The schedule stays mounted underneath.
    expect(view.container.querySelector('.ws-schedule__table')).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(view.container.inert).toBe(false)
    expect(document.body.style.overflow).toBe('')
  })

  it('preserves the page scroll and route: focus returns without scrolling and the hash is untouched', async () => {
    window.location.hash = '#/schedule'
    await renderSchedule()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const { user } = await openPreview('At the Zoo')
    await user.keyboard('{Escape}')
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
    expect(window.location.hash).toBe('#/schedule')
  })

  it('reuses a cached preview for the same fingerprint, across reopening and remounting', async () => {
    const { client, cache, view } = await renderSchedule()
    let { user, dialog } = await openPreview('At the Zoo')
    await within(dialog).findByRole('img')
    await user.keyboard('{Escape}')
    ;({ user, dialog } = await openPreview('At the Zoo'))
    expect(within(dialog).getByRole('img')).toBeTruthy() // immediately, no loading
    expect(within(dialog).getByRole('status').textContent).toBe('')
    await user.keyboard('{Escape}')
    expect(client.previewPuzzle).toHaveBeenCalledTimes(1)

    // Leaving and returning to the schedule keeps the session's cache.
    view.unmount()
    await renderSchedule(client, cache)
    await openPreview('At the Zoo')
    expect(client.previewPuzzle).toHaveBeenCalledTimes(1)
  })

  it('fetches again when the schedule shows a new fingerprint for the same ID', async () => {
    const client = fakeClient()
    const { cache } = await renderSchedule(client)
    const { user, dialog } = await openPreview('At the Zoo')
    await within(dialog).findByRole('img')
    await user.keyboard('{Escape}')

    const replaced = { ...ZOO, contentFingerprint: 'd'.repeat(64) }
    vi.mocked(client.schedule).mockResolvedValue({ ok: true, body: { status: 'ok', schedule: schedule([COLORS, SPACE, replaced]) } })
    vi.mocked(client.previewPuzzle).mockResolvedValue(ok(replaced, { answers: [{ word: 'BAT', direction: 'across' }] }))
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' }).textContent).toBe('Refresh'))
    const again = await openPreview('At the Zoo')
    expect(await within(again.dialog).findByText('BAT')).toBeTruthy()
    expect(client.previewPuzzle).toHaveBeenLastCalledWith({ puzzleId: 'zoo', expectedFingerprint: 'd'.repeat(64) })
    expect(cache.get('zoo', 'c'.repeat(64))).toBeUndefined() // the stale preview is gone
  })

  it('shares an in-flight request: closing while loading and reopening starts no second fetch', async () => {
    const pending = deferred<ProductionResult<ProductionPuzzlePreviewBody>>()
    const client = fakeClient({ previewPuzzle: vi.fn(() => pending.promise) })
    await renderSchedule(client)
    let { user } = await openPreview('At the Zoo')
    await user.keyboard('{Escape}')
    ;({ user } = await openPreview('At the Zoo'))
    await act(async () => pending.resolve(ok(ZOO)))
    expect(await within(screen.getByRole('dialog')).findByRole('img')).toBeTruthy()
    expect(client.previewPuzzle).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ ok: true, body: { status: 'not-found' } }, /no longer in the Production schedule/, false],
    [{ ok: true, body: { status: 'changed', current: { ...ZOO, clue: 'Bats' } } }, /now holds different content/, false],
    [{ ok: true, body: { status: 'unavailable', message: 'Production is unavailable right now. Nothing was changed; try again.' } }, /Production is unavailable/, true],
    [{ ok: true, body: { status: 'production-unavailable', reason: 'uncertain', message: 'may or may not have completed' } }, /didn’t complete\. Nothing was changed/, true],
    [{ ok: false }, /Couldn’t reach the Production operations server/, true],
  ] as [ProductionResult<ProductionPuzzlePreviewBody>, RegExp, boolean][])('shows a clear error and a way out: %j', async (result, message, retryable) => {
    const client = fakeClient({ previewPuzzle: vi.fn(async () => result) })
    await renderSchedule(client)
    const { user, dialog } = await openPreview('At the Zoo')
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(message)
    expect(within(dialog).queryByRole('img')).toBeNull() // nothing stale or mismatched is shown
    expect(within(dialog).queryByText('Loading the puzzle from Production…')).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Try Again' }) !== null).toBe(retryable)
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('never caches a failure: Try Again (or reopening) fetches again', async () => {
    const client = fakeClient()
    vi.mocked(client.previewPuzzle).mockResolvedValueOnce({ ok: false })
    await renderSchedule(client)
    const { user, dialog } = await openPreview('At the Zoo')
    await user.click(await within(dialog).findByRole('button', { name: 'Try Again' }))
    expect(await within(dialog).findByRole('img')).toBeTruthy()
    expect(client.previewPuzzle).toHaveBeenCalledTimes(2)
  })

  it('notes a puzzle whose date changed since the schedule loaded', async () => {
    const client = fakeClient({ previewPuzzle: vi.fn(async () => ok(ZOO, { publishDate: '2026-10-08', releaseInstant: '2026-10-08T02:00:00.000Z' })) })
    await renderSchedule(client)
    const { dialog } = await openPreview('At the Zoo')
    expect(await within(dialog).findByText(/Production now has this puzzle on October 8, 2026/)).toBeTruthy()
  })

  it('keeps puzzle content out of browser storage', async () => {
    // Source code can't name browser storage at all (isolation.test.ts); this checks the behavior too.
    const storage = () => ({ getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn(), length: 0 })
    const local = storage()
    const session = storage()
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', session)
    try {
      await renderSchedule()
      const { user, dialog } = await openPreview('At the Zoo')
      await within(dialog).findByRole('img')
      await user.keyboard('{Escape}')
      await openPreview('At the Zoo')
      for (const fn of [local.setItem, session.setItem, local.getItem, session.getItem]) expect(fn).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('leaves removal working as before', async () => {
    const client = fakeClient({
      previewRemoval: vi.fn(async () => ({ ok: true as const, body: { status: 'removable' as const, target: ZOO, moves: [] } })),
    })
    await renderSchedule(client)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Remove At the Zoo/ }))
    expect(await screen.findByText(/Removing: At the Zoo \(zoo\)/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Type the puzzle ID/), { target: { value: 'zoo' } })
    expect(screen.getByRole('button', { name: 'Remove from Schedule' }).hasAttribute('disabled')).toBe(false)
    expect(client.previewPuzzle).not.toHaveBeenCalled()
  })
})
