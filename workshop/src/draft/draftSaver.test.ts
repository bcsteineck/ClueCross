import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialDraft } from '../state/workshopReducer'
import type { WorkshopDraft } from '../state/workshopReducer'
import type { DraftSaveBody, DraftSaveRequest } from './contract'
import type { DraftClient, DraftClientResult } from './draftClient'
import { DRAFT_SAVE_DEBOUNCE_MS, DraftSaver } from './draftSaver'
import type { DraftSaveStatus } from './draftSaver'

// A client whose save responses the test resolves by hand, in any order.
function controlledClient() {
  const calls: { request: DraftSaveRequest; keepalive: boolean; resolve: (result: DraftClientResult<DraftSaveBody>) => void }[] = []
  const client: DraftClient = {
    load: () => Promise.resolve({ ok: true, body: { status: 'empty' } }),
    save: (request, options = {}) =>
      new Promise((resolve) => calls.push({ request, keepalive: options.keepalive ?? false, resolve })),
  }
  const saved = (revision: number) => ({ ok: true as const, body: { status: 'saved' as const, revision, savedAt: 'now' } })
  return { client, calls, saved }
}

const withClue = (clue: string): WorkshopDraft => ({ ...createInitialDraft(), clue })

let statuses: DraftSaveStatus[]
const last = () => statuses[statuses.length - 1]

beforeEach(() => {
  vi.useFakeTimers()
  statuses = []
})
afterEach(() => vi.useRealTimers())

function saverWith(client: DraftClient, revision = 0, saved = createInitialDraft()) {
  return new DraftSaver(client, revision, saved, (status) => statuses.push(status))
}

describe('DraftSaver: timing', () => {
  it('debounces typed edits into one save of the newest draft', async () => {
    const { client, calls, saved } = controlledClient()
    const saver = saverWith(client)
    saver.update(withClue('D'), { immediate: false })
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS - 1)
    saver.update(withClue('Do'), { immediate: false })
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS - 1)
    const newest = withClue('Dogs')
    saver.update(newest, { immediate: false })
    expect(last()).toEqual({ kind: 'pending' })
    expect(calls).toHaveLength(0)

    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS)
    expect(calls).toHaveLength(1)
    expect(calls[0].request).toEqual({ baseRevision: 0, draft: newest })
    calls[0].resolve(saved(1))
    await vi.runAllTimersAsync()
    expect(last()).toEqual({ kind: 'saved' })
    expect(saver.revision).toBe(1)
    expect(saver.hasUnsavedChanges()).toBe(false)
  })

  it('saves discrete actions at once, cancelling a pending debounce', () => {
    const { client, calls } = controlledClient()
    const saver = saverWith(client)
    saver.update(withClue('D'), { immediate: false })
    const approved = withClue('Dogs approved')
    saver.update(approved, { immediate: true })
    expect(calls.map((call) => call.request.draft)).toEqual([approved])
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS * 2)
    expect(calls).toHaveLength(1)
  })

  it('keeps one save in flight; edits made meanwhile go in the next save with the next revision', async () => {
    const { client, calls, saved } = controlledClient()
    const saver = saverWith(client)
    saver.update(withClue('A'), { immediate: true })
    saver.update(withClue('B'), { immediate: true })
    const newest = withClue('C')
    saver.update(newest, { immediate: true })
    expect(calls).toHaveLength(1) // never two at once, so responses can't arrive out of order

    calls[0].resolve(saved(1))
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].request).toEqual({ baseRevision: 1, draft: newest })
    calls[1].resolve(saved(2))
    await vi.runAllTimersAsync()
    expect(last()).toEqual({ kind: 'saved' })
    expect(saver.revision).toBe(2)
  })

  it('reports no change when the draft returns to the saved one', () => {
    const { client, calls } = controlledClient()
    const initial = createInitialDraft()
    const saver = saverWith(client, 0, initial)
    saver.update(withClue('x'), { immediate: false })
    saver.update(initial, { immediate: false })
    vi.advanceTimersByTime(DRAFT_SAVE_DEBOUNCE_MS * 2)
    expect(calls).toHaveLength(0)
    expect(last()).toEqual({ kind: 'saved' })
  })
})

describe('DraftSaver: failures and conflicts', () => {
  it('keeps the draft after a failed save, never retries on its own, and retries on request or the next edit', async () => {
    const { client, calls, saved } = controlledClient()
    const saver = saverWith(client)
    const draft = withClue('Dogs')
    saver.update(draft, { immediate: true })
    calls[0].resolve({ ok: false })
    await vi.runAllTimersAsync()
    expect(last()).toEqual({ kind: 'failed', message: 'Couldn’t reach the Workshop server.' })
    expect(saver.hasUnsavedChanges()).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toHaveLength(1)

    void saver.flush() // Retry
    expect(calls[1].request).toEqual({ baseRevision: 0, draft })
    calls[1].resolve({ ok: true, body: { status: 'unavailable', message: 'Disk full.' } })
    await vi.runAllTimersAsync()
    expect(last()).toEqual({ kind: 'failed', message: 'Disk full.' })

    saver.update(withClue('Dogs!'), { immediate: false }) // the next edit tries again
    await vi.advanceTimersByTimeAsync(DRAFT_SAVE_DEBOUNCE_MS)
    expect(calls).toHaveLength(3)
    calls[2].resolve(saved(1))
    await vi.runAllTimersAsync()
    expect(last()).toEqual({ kind: 'saved' })
  })

  it('pauses on a conflict, keeps later edits in memory, and only overwrites when asked', async () => {
    const { client, calls, saved } = controlledClient()
    const saver = saverWith(client, 3)
    saver.update(withClue('mine'), { immediate: true })
    calls[0].resolve({ ok: true, body: { status: 'conflict', revision: 5 } })
    await vi.runAllTimersAsync()
    expect(last()).toEqual({ kind: 'conflict', revision: 5 })

    const later = withClue('mine, later')
    saver.update(later, { immediate: true })
    void saver.flush()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toHaveLength(1)
    expect(saver.hasUnsavedChanges()).toBe(true)

    void saver.overwriteAfterConflict()
    expect(calls[1].request).toEqual({ baseRevision: 5, draft: later })
    calls[1].resolve(saved(6))
    await vi.runAllTimersAsync()
    expect(last()).toEqual({ kind: 'saved' })
  })
})

describe('DraftSaver: New Puzzle replacement', () => {
  it('waits for the save in flight, then writes the empty draft on the latest revision', async () => {
    const { client, calls, saved } = controlledClient()
    const saver = saverWith(client)
    saver.update(withClue('Dogs'), { immediate: true })
    const fresh = createInitialDraft()
    const replacing = saver.replaceWith(fresh)
    saver.update(withClue('Dogs typed during the reset'), { immediate: true }) // held, not saved
    expect(calls).toHaveLength(1)
    calls[0].resolve(saved(1))
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].request).toEqual({ baseRevision: 1, draft: fresh })
    calls[1].resolve(saved(2))
    expect(await replacing).toEqual({ ok: true })
    expect(saver.revision).toBe(2)
    expect(saver.hasUnsavedChanges()).toBe(false)
    await vi.runAllTimersAsync()
    expect(calls).toHaveLength(2)
  })

  it('a failed reset changes nothing and goes back to saving the current draft', async () => {
    const { client, calls, saved } = controlledClient()
    const saver = saverWith(client, 4)
    const current = withClue('unsaved edit')
    saver.update(current, { immediate: false })
    const replacing = saver.replaceWith(createInitialDraft())
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    calls[0].resolve({ ok: false })
    expect(await replacing).toEqual({ ok: false, message: 'Couldn’t reach the Workshop server.' })
    expect(saver.revision).toBe(4)
    // The unsaved edit is still pending and is saved next.
    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1].request).toEqual({ baseRevision: 4, draft: current })
    calls[1].resolve(saved(5))
    await vi.runAllTimersAsync()
    expect(last()).toEqual({ kind: 'saved' })
  })

  it('refuses to reset while a conflict is unresolved', async () => {
    const { client, calls } = controlledClient()
    const saver = saverWith(client)
    saver.update(withClue('mine'), { immediate: true })
    calls[0].resolve({ ok: true, body: { status: 'conflict', revision: 2 } })
    await vi.runAllTimersAsync()
    expect(await saver.replaceWith(createInitialDraft())).toEqual({
      ok: false,
      message: 'Resolve the save conflict before starting a new puzzle.',
    })
    expect(calls).toHaveLength(1)
  })
})

describe('DraftSaver: page unload', () => {
  it('sends unsaved changes with keepalive, but never alongside a save in flight', () => {
    const { client, calls } = controlledClient()
    const saver = saverWith(client)
    saver.flushOnPageHide()
    expect(calls).toHaveLength(0)
    const draft = withClue('Dogs')
    saver.update(draft, { immediate: false })
    saver.flushOnPageHide()
    expect(calls).toEqual([expect.objectContaining({ keepalive: true, request: { baseRevision: 0, draft } })])

    const busy = controlledClient()
    const second = saverWith(busy.client)
    second.update(draft, { immediate: true })
    second.flushOnPageHide()
    expect(busy.calls).toHaveLength(1)
  })
})
