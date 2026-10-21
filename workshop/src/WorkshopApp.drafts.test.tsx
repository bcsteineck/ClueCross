// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { createMemoryDraftStore, memoryDraftClient } from '../server/draft/memoryDraftStore'
import type { MemoryDraftStore } from '../server/draft/memoryDraftStore'
import { DEV_PUBLICATION, envelopeOf, fullDraft } from '../server/draft/testDrafts'
import type { DraftReadResult } from '../server/draft/draftStore'
import type { PreviewResponseBody, PublishRequest, PublishResponseBody } from './publishing/contract'
import type { ClientResult, PublishingClient } from './publishing/publishingClient'
import type { CandidateSource } from './sourcing/contract'
import { FIXTURE_SOURCING_RESPONSE } from './sourcing/fixtureSource'
import { createInitialDraft } from './state/workshopReducer'
import type { WorkshopDraft } from './state/workshopReducer'
import { WorkshopApp } from './WorkshopApp'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SAVE_WAIT = { timeout: 3000 }
const NOT_CONFIGURED = { status: 'not-configured', message: 'Publishing is not configured on this Workshop server.' } as const

function fakePublisher(
  options: {
    preview?: (request: PublishRequest) => Promise<ClientResult<PreviewResponseBody>>
    publish?: (request: PublishRequest) => Promise<ClientResult<PublishResponseBody>>
  } = {},
) {
  return {
    preview: vi.fn<PublishingClient['preview']>(options.preview ?? (async () => ({ ok: true, body: NOT_CONFIGURED }))),
    publish: vi.fn<PublishingClient['publish']>(options.publish ?? (async () => ({ ok: true, body: NOT_CONFIGURED }))),
  }
}

interface AppOptions {
  store?: MemoryDraftStore
  initial?: DraftReadResult
  offline?: () => boolean
  publisher?: PublishingClient
  sources?: { live?: CandidateSource; fixture?: CandidateSource }
}

function renderApp({ store, initial, offline, publisher = fakePublisher(), sources }: AppOptions = {}) {
  const drafts = store ?? createMemoryDraftStore(initial)
  const user = userEvent.setup()
  const view = render(
    <WorkshopApp drafts={memoryDraftClient(drafts, { offline })} publisher={publisher} production={null} sources={sources} />,
  )
  return { user, store: drafts, ...view }
}

const ready = () => screen.findByLabelText('Clue')

function savedDraft(store: MemoryDraftStore): WorkshopDraft {
  const current = store.current()
  if (current.kind !== 'ok') throw new Error(`no saved draft (${current.kind})`)
  return current.envelope.draft
}

const savedRevision = (store: MemoryDraftStore) => {
  const current = store.current()
  return current.kind === 'ok' ? current.envelope.revision : 0
}

const picker = () => screen.getByRole('group', { name: /^Priority Words/ })
const priorityBox = (word: string) => within(picker()).getByRole('checkbox', { name: word }) as HTMLInputElement
const clueField = () => screen.getByLabelText('Clue') as HTMLInputElement

async function fillDogs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(clueField(), 'Dogs')
  await user.click(screen.getByLabelText('Candidate words'))
  await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
}

async function generateAndApprove(user: ReturnType<typeof userEvent.setup>, index = 0) {
  await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
  const cards = within(screen.getByRole('region', { name: /Generated Candidates/ })).getAllByRole('button')
  await user.click(cards[index])
  await user.click(screen.getByRole('button', { name: 'Approve Candidate' }))
  await screen.findByRole('heading', { name: /^Final Puzzle/ })
}

describe('working draft: startup', () => {
  it('a fresh Workshop opens an empty draft and writes nothing until the author edits', async () => {
    const { user, store } = renderApp()
    await ready()
    expect(screen.getByText('Draft saved')).toBeTruthy()
    expect(store.writes).toHaveLength(0)

    await user.type(clueField(), 'Dogs')
    await waitFor(() => expect(savedDraft(store).clue).toBe('Dogs'), SAVE_WAIT)
    // Typing is debounced into a single write.
    expect(store.writes).toHaveLength(1)
  })

  it('never writes over a saved draft while loading it', async () => {
    const { store } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft(), 5) } })
    await ready()
    await waitFor(() => expect(clueField().value).toBe('Dogs'))
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(store.writes).toHaveLength(0)
    expect(savedRevision(store)).toBe(5)
  })

  it('a failed load shows no authoring inputs, writes nothing, and can be retried', async () => {
    let offline = true
    const { user, store } = renderApp({ offline: () => offline })
    expect((await screen.findByRole('alert')).textContent).toMatch('Couldn’t reach the Workshop server to load the working draft.')
    expect(screen.queryByLabelText('Clue')).toBeNull()
    expect(screen.queryByRole('button', { name: 'New Puzzle' })).toBeNull()
    expect(store.writes).toHaveLength(0)

    offline = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await ready()
  })

  it('an unreadable saved draft is reported, kept, and only set aside after confirmation', async () => {
    const { user, store } = renderApp({ initial: { kind: 'invalid', message: 'The saved working draft is not valid JSON.' } })
    await screen.findByRole('heading', { name: 'The saved working draft can’t be opened' })
    expect(screen.getByRole('alert').textContent).toBe('The saved working draft is not valid JSON.')
    expect(screen.queryByLabelText('Clue')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Set Aside and Start a New Draft…' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(store.writes).toHaveLength(0)
    expect(store.current().kind).toBe('invalid')

    await user.click(screen.getByRole('button', { name: 'Set Aside and Start a New Draft…' }))
    await user.click(screen.getByRole('button', { name: 'Set Aside and Start New Draft' }))
    await ready()
    expect(store.setAside).toEqual(['The saved working draft is not valid JSON.'])
    expect(store.writes.map((write) => write.replaceInvalid)).toEqual([true])
    expect(savedDraft(store)).toEqual(createInitialDraft())
  })
})

describe('working draft: restoring', () => {
  it('restores both modes, Priority Words, sourcing and Pool Review choices, and generation count', async () => {
    const { user } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft(), 3) } })
    await ready()
    expect(clueField().value).toBe('Dogs')
    expect((screen.getByRole('radio', { name: 'Source from clue' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Author context (optional)') as HTMLInputElement).value).toBe('Pets')
    expect((screen.getByLabelText('Proper nouns') as HTMLSelectElement).value).toBe('allow')
    expect((screen.getByLabelText('Candidate source') as HTMLSelectElement).value).toBe('fixture')
    const review = screen.getByRole('region', { name: 'Pool Review' })
    expect((within(review).getByRole('checkbox', { name: 'Include Beagle' }) as HTMLInputElement).checked).toBe(false)
    expect(priorityBox('POODLE').checked).toBe(true)

    await user.click(screen.getByRole('radio', { name: 'Enter manually' }))
    expect((screen.getByLabelText('Candidate words') as HTMLTextAreaElement).value).toBe(DOGS_CANDIDATE_POOL.join('\n'))
    expect(priorityBox('KENNEL').checked).toBe(true)
    expect(priorityBox('POODLE').checked).toBe(false)

    // The unsaved batch isn't restored, but the generation count is.
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    expect(screen.getByText(/seed workshop-generation-4/)).toBeTruthy()
  })

  it('restores the approved Final Puzzle without its batch, openable and editable', async () => {
    const { user } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft()) } })
    await ready()
    const panel = screen.getByRole('region', { name: 'Final Puzzle' })
    expect(panel.textContent).toMatch('Approved Candidate 2 · dogs7 · “Good dogs”.')
    const open = within(panel).getByRole('button', { name: 'Open Final Puzzle' })
    await user.click(open)

    await screen.findByRole('heading', { name: /^Final Puzzle/ })
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('dogs7')
    expect((screen.getByLabelText('Clue') as HTMLInputElement).value).toBe('Good dogs')
    expect(screen.getByRole('img', { name: /Final puzzle board/ })).toBeTruthy()
    expect(screen.getByText(/Ready to export/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Final Puzzle' }))
  })

  it('a refresh restores the session’s work, but not the unsaved batch', async () => {
    const first = renderApp()
    await ready()
    await fillDogs(first.user)
    await first.user.click(priorityBox('BEAGLE'))
    await generateAndApprove(first.user)
    const id = screen.getByLabelText('Puzzle ID')
    await first.user.clear(id)
    await first.user.type(id, 'dogs9')
    await waitFor(() => expect(savedDraft(first.store).finalPuzzle?.inputs.id).toBe('dogs9'), SAVE_WAIT)
    first.unmount()

    const second = renderApp({ store: first.store })
    await ready()
    expect(clueField().value).toBe('Dogs')
    expect(priorityBox('BEAGLE').checked).toBe(true)
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
    expect(screen.getByRole('region', { name: 'Final Puzzle' }).textContent).toMatch('Approved Candidate 1 · dogs9 · “Dogs”.')
    await second.user.click(screen.getByRole('button', { name: 'Open Final Puzzle' }))
    expect((await screen.findByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('dogs9')
  })

  it('explains that generated candidates are temporary', async () => {
    const { user, store } = renderApp()
    await ready()
    await fillDogs(user)
    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    expect(
      screen.getByText(
        'Generated candidates are temporary until approved as the Final Puzzle. Unsaved candidates will be lost when you close or refresh the Workshop.',
      ),
    ).toBeTruthy()
    await waitFor(() => expect(savedDraft(store).generationCount).toBe(1), SAVE_WAIT)
    expect(JSON.stringify(savedDraft(store))).not.toMatch(/"batch"|"diversity"/)
  })
})

describe('working draft: save failures and conflicts', () => {
  it('a failed save keeps the edit, says so, and Retry saves it', async () => {
    let offline = false
    const { user, store } = renderApp({ offline: () => offline })
    await ready()
    offline = true
    await user.type(clueField(), 'Dogs')
    const alert = await screen.findByRole('alert', {}, SAVE_WAIT)
    expect(alert.textContent).toMatch('Draft not saved. Couldn’t reach the Workshop server. Your changes are kept in this window.')
    expect(clueField().value).toBe('Dogs')

    offline = false
    await user.click(screen.getByRole('button', { name: 'Retry Saving' }))
    await screen.findByText('Draft saved')
    expect(savedDraft(store).clue).toBe('Dogs')
  })

  it('a write from another window is never overwritten silently; Keep My Changes replaces it explicitly', async () => {
    const { user, store } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(createInitialDraft(), 1) } })
    await ready()
    await store.write({ baseRevision: 1, draft: { ...createInitialDraft(), clue: 'Pirates' } }) // the other window

    await user.type(clueField(), 'Dogs')
    const alert = await screen.findByRole('alert', {}, SAVE_WAIT)
    expect(alert.textContent).toMatch('changed in another Workshop window or mode')
    expect(savedDraft(store).clue).toBe('Pirates')

    await user.click(screen.getByRole('button', { name: 'Keep My Changes (Replace Saved Draft)' }))
    await screen.findByText('Draft saved')
    expect(savedDraft(store).clue).toBe('Dogs')
    expect(savedRevision(store)).toBe(3)
  })

  it('Load Saved Draft replaces this window’s draft with the newer saved one', async () => {
    const { user, store } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(createInitialDraft(), 1) } })
    await ready()
    await store.write({ baseRevision: 1, draft: { ...createInitialDraft(), clue: 'Pirates' } })
    await user.type(clueField(), 'Dogs')
    await screen.findByRole('alert', {}, SAVE_WAIT)
    await user.click(screen.getByRole('button', { name: 'Load Saved Draft (Discard Changes Here)' }))
    await waitFor(() => expect(clueField().value).toBe('Pirates'))
    expect(screen.getByText('Draft saved')).toBeTruthy()
  })
})

describe('New Puzzle', () => {
  it('asks first; Cancel and Escape change nothing', async () => {
    const { user, store } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft(), 1) } })
    await ready()
    const button = screen.getByRole('button', { name: 'New Puzzle' })
    await user.click(button)
    const confirm = screen.getByRole('group', { name: 'Start a new puzzle?' })
    expect(confirm.textContent).toMatch(
      'This will permanently clear the current working draft, including its authoring inputs, Priority Words, and Final Puzzle. This cannot be undone.',
    )
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }))

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Start a new puzzle?' })).toBeNull()
    expect(document.activeElement).toBe(button)
    await user.click(button)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Start a new puzzle?' })).toBeNull()

    expect(clueField().value).toBe('Dogs')
    expect(store.writes).toHaveLength(0)
  })

  it('confirming saves an empty draft, then clears everything and starts again at the clue', async () => {
    const publisher = fakePublisher()
    const first = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft(), 1) }, publisher })
    await ready()
    await first.user.click(screen.getByRole('radio', { name: 'Enter manually' }))
    await first.user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    await first.user.click(screen.getByRole('button', { name: 'New Puzzle' }))
    await first.user.click(screen.getByRole('button', { name: 'Start New Puzzle' }))

    await waitFor(() => expect(clueField().value).toBe(''))
    expect(document.activeElement).toBe(clueField())
    expect((screen.getByRole('radio', { name: 'Enter manually' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Candidate words') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Final Puzzle' })).toBeNull()
    expect(picker().textContent).toMatch('(0 of 10 selected)')
    await first.user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    expect(screen.queryByRole('region', { name: 'Pool Review' })).toBeNull()
    expect(picker().textContent).toMatch('(0 of 10 selected)')

    expect(savedDraft(first.store)).toEqual({ ...createInitialDraft(), poolSource: 'sourced' })
    // Purely local: nothing reached publishing.
    expect(publisher.publish).not.toHaveBeenCalled()

    // The reset survives a refresh, and generation numbering starts again.
    first.unmount()
    const second = renderApp({ store: first.store })
    await ready()
    expect(clueField().value).toBe('')
    await second.user.click(screen.getByRole('radio', { name: 'Enter manually' }))
    await fillDogs(second.user)
    await second.user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    expect(screen.getByText(/seed workshop-generation-1 /)).toBeTruthy()
  })

  it('a failed reset keeps the current draft and says so', async () => {
    let offline = false
    const { user, store } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft(), 1) }, offline: () => offline })
    await ready()
    offline = true
    await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
    await user.click(screen.getByRole('button', { name: 'Start New Puzzle' }))
    const confirm = screen.getByRole('group', { name: 'Start a new puzzle?' })
    expect((await within(confirm).findByRole('alert')).textContent).toMatch(
      'The new puzzle wasn’t started, and the current draft is unchanged.',
    )
    expect(clueField().value).toBe('Dogs')
    expect(screen.getByRole('region', { name: 'Final Puzzle' })).toBeTruthy()
    expect(savedRevision(store)).toBe(1)
  })

  it('a sourcing response that arrives after New Puzzle is dropped', async () => {
    let resolve!: (value: unknown) => void
    const live = { generate: vi.fn(() => new Promise((r) => (resolve = r))) }
    const { user, store } = renderApp({ sources: { live } })
    await ready()
    await user.type(clueField(), 'Dogs')
    await user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    await user.click(screen.getByRole('button', { name: 'Source Candidates' }))
    await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
    await user.click(screen.getByRole('button', { name: 'Start New Puzzle' }))
    await waitFor(() => expect(clueField().value).toBe(''))

    await user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    resolve(FIXTURE_SOURCING_RESPONSE)
    await screen.findByRole('button', { name: 'Source Candidates' })
    expect(screen.queryByRole('region', { name: 'Pool Review' })).toBeNull()
    await waitFor(() => expect(savedDraft(store).poolSource).toBe('sourced'), SAVE_WAIT)
    expect(savedDraft(store).sourcing.pool).toBeNull()
  })

  it('a publish response that arrives after New Puzzle is dropped', async () => {
    let finish!: (value: ClientResult<PublishResponseBody>) => void
    const publisher = fakePublisher({
      preview: async () => ({
        ok: true,
        body: {
          status: 'estimate',
          estimate: { publishDate: '2026-10-21', releaseInstant: '2026-10-21T02:00:00.000Z', contentFingerprint: 'f'.repeat(64) },
        },
      }),
      publish: () => new Promise((resolve) => (finish = resolve)),
    })
    const { user, store } = renderApp({ publisher })
    await ready()
    await fillDogs(user)
    await generateAndApprove(user)
    const id = screen.getByLabelText('Puzzle ID')
    await user.clear(id)
    await user.type(id, 'dogs9') // "dogs" is a reserved fixture ID
    await user.click(await screen.findByRole('button', { name: 'Publish to Dev Calendar' }, SAVE_WAIT))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
    await user.click(screen.getByRole('button', { name: 'Start New Puzzle' }))
    await waitFor(() => expect(clueField().value).toBe(''))

    finish({ ok: true, body: { status: 'created', publication: DEV_PUBLICATION.publication } })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('region', { name: 'Final Puzzle' })).toBeNull()
    expect(savedDraft(store).finalPuzzle).toBeNull()
  })
})

describe('restored publications', () => {
  const restoredPublished = () => ({ kind: 'ok' as const, envelope: envelopeOf(fullDraft({ published: true }), 2) })
  const existing: PreviewResponseBody = { status: 'existing', publication: DEV_PUBLICATION.publication }

  async function openFinal(user: ReturnType<typeof userEvent.setup>) {
    await ready()
    await user.click(screen.getByRole('button', { name: 'Open Final Puzzle' }))
    await screen.findByRole('heading', { name: /^Final Puzzle/ })
  }

  it('stays locked and is re-checked with the dev calendar, which confirms it', async () => {
    const publisher = fakePublisher({ preview: async () => ({ ok: true, body: existing }) })
    const { user } = renderApp({ initial: restoredPublished(), publisher })
    await openFinal(user)
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).readOnly).toBe(true)
    expect(screen.getByText(/Already scheduled for|Scheduled for/)).toBeTruthy()
    await screen.findByText(/The dev calendar still has this puzzle/)
    expect(publisher.preview).toHaveBeenCalledWith(expect.objectContaining({ id: 'dogs7', clue: 'Good dogs' }))
    expect(publisher.publish).not.toHaveBeenCalled()
  })

  it('unlocks, and clears the saved record, when the dev calendar no longer has that ID', async () => {
    const publisher = fakePublisher({
      preview: async () => ({
        ok: true,
        body: {
          status: 'estimate',
          estimate: { publishDate: '2026-10-22', releaseInstant: '2026-10-22T02:00:00.000Z', contentFingerprint: 'a'.repeat(64) },
        },
      }),
    })
    const { user, store } = renderApp({ initial: restoredPublished(), publisher })
    await openFinal(user)
    await screen.findByText(/no longer has a puzzle with its ID, so the ID and clue are unlocked/)
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).readOnly).toBe(false)
    await waitFor(() => expect(savedDraft(store).finalPuzzle?.publication).toBeNull(), SAVE_WAIT)
  })

  it('stays locked when the dev calendar can’t be reached', async () => {
    const publisher = fakePublisher({ preview: async () => ({ ok: false, failure: 'network' }) })
    const { user, store } = renderApp({ initial: restoredPublished(), publisher })
    await openFinal(user)
    await screen.findByText(/couldn’t confirm it right now\. The ID and clue stay locked/)
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).readOnly).toBe(true)
    expect(savedDraft(store).finalPuzzle?.publication).toEqual(DEV_PUBLICATION)
  })
})
