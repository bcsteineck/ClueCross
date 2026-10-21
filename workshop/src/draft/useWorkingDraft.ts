// Connects the Workshop reducer to the saved working draft:
//
// - Startup: loads and validates the saved draft before authoring is shown
//   (phase 'loading'), then restores it with DRAFT_RESTORED and a fresh
//   session. Nothing is written until the load succeeds, so a failed or
//   slow load can never overwrite a saved draft with an empty one. An
//   unreadable file is reported (phase 'invalid') and left untouched until
//   the author explicitly sets it aside.
// - Autosave: every durable change goes to a DraftSaver. Typed text is
//   debounced; every other action saves at once.
// - New Puzzle: the empty draft is saved first; the app only resets once
//   that write succeeds, so the old draft can't reappear after a restart.
// - Epoch: increases whenever the draft is replaced wholesale (restore,
//   reload, New Puzzle). Async work captures it at the start and drops its
//   result if it changed, so a late response can't touch a newer draft.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch } from 'react'
import { createInitialDraft } from '../state/workshopReducer'
import type { WorkshopAction, WorkshopDraft } from '../state/workshopReducer'
import type { DraftClient } from './draftClient'
import { DraftSaver } from './draftSaver'
import type { DraftSaveStatus, ReplaceResult } from './draftSaver'
import { parseDraftEnvelope } from './draftSchema'

export type DraftPhase =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'load-failed'; message: string }
  | { kind: 'invalid'; message: string }

// Typed into a text field: saved after a pause rather than per keystroke.
const DEBOUNCED_ACTIONS = new Set<WorkshopAction['type']>([
  'SET_CLUE',
  'SET_POOL_TEXT',
  'SET_SOURCING_CONTEXT',
  'SET_FINAL_PUZZLE_INPUTS',
])

const UNREACHABLE = 'Couldn’t reach the Workshop server to load the working draft.'

export interface WorkingDraft {
  phase: DraftPhase
  saveStatus: DraftSaveStatus
  /** Dispatches to the reducer and schedules saving the resulting draft. */
  dispatch: Dispatch<WorkshopAction>
  currentEpoch: () => number
  /** Retries the startup load, or reloads the saved draft (discarding unsaved changes here). */
  reload: () => void
  retrySave: () => void
  overwriteAfterConflict: () => void
  startNewPuzzle: () => Promise<ReplaceResult>
  /** Recovery from an unreadable file: sets it aside and starts an empty draft. */
  replaceInvalidDraft: () => Promise<ReplaceResult>
}

export function useWorkingDraft(client: DraftClient, draft: WorkshopDraft, rawDispatch: Dispatch<WorkshopAction>): WorkingDraft {
  const [phase, setPhase] = useState<DraftPhase>({ kind: 'loading' })
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>({ kind: 'saved' })
  const [loadAttempt, setLoadAttempt] = useState(0)
  const saverRef = useRef<DraftSaver | null>(null)
  const immediateRef = useRef(true)
  const epochRef = useRef(0)

  const replaceDraft = useCallback(
    (next: WorkshopDraft, revision: number, action: WorkshopAction) => {
      saverRef.current?.dispose()
      saverRef.current = new DraftSaver(client, revision, next, setSaveStatus)
      epochRef.current += 1
      immediateRef.current = true
      setSaveStatus({ kind: 'saved' })
      rawDispatch(action)
    },
    [client, rawDispatch],
  )

  useEffect(() => {
    let cancelled = false
    setPhase({ kind: 'loading' })
    void client.load().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setPhase({ kind: 'load-failed', message: UNREACHABLE })
        return
      }
      const { body } = result
      if (body.status === 'empty') {
        const fresh = createInitialDraft()
        replaceDraft(fresh, 0, { type: 'DRAFT_RESTORED', draft: fresh })
        setPhase({ kind: 'ready' })
      } else if (body.status === 'ok') {
        // The browser re-validates: the response is untrusted input too.
        const parsed = parseDraftEnvelope(body.envelope)
        if (!parsed.ok) {
          setPhase({ kind: 'invalid', message: parsed.message })
          return
        }
        replaceDraft(parsed.value.draft, parsed.value.revision, { type: 'DRAFT_RESTORED', draft: parsed.value.draft })
        setPhase({ kind: 'ready' })
      } else if (body.status === 'invalid') {
        setPhase({ kind: 'invalid', message: body.message })
      } else {
        setPhase({ kind: 'load-failed', message: body.message })
      }
    })
    return () => {
      cancelled = true
    }
  }, [client, replaceDraft, loadAttempt])

  useEffect(() => () => saverRef.current?.dispose(), [])

  useEffect(() => {
    saverRef.current?.update(draft, { immediate: immediateRef.current })
    immediateRef.current = true
  }, [draft])

  const unsaved = saveStatus.kind === 'failed' || saveStatus.kind === 'conflict'
  useEffect(() => {
    const onPageHide = () => saverRef.current?.flushOnPageHide()
    // Asks before leaving only when changes genuinely couldn't be saved.
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (unsaved) event.preventDefault()
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [unsaved])

  const dispatch = useCallback<Dispatch<WorkshopAction>>(
    (action) => {
      immediateRef.current = !DEBOUNCED_ACTIONS.has(action.type)
      rawDispatch(action)
    },
    [rawDispatch],
  )

  async function startNewPuzzle(): Promise<ReplaceResult> {
    const saver = saverRef.current
    if (!saver) return { ok: false, message: 'The working draft isn’t loaded.' }
    const fresh = createInitialDraft()
    const result = await saver.replaceWith(fresh)
    if (result.ok) {
      epochRef.current += 1
      immediateRef.current = true
      rawDispatch({ type: 'NEW_PUZZLE', draft: fresh })
    }
    return result
  }

  async function replaceInvalidDraft(): Promise<ReplaceResult> {
    const fresh = createInitialDraft()
    const result = await client.save({ baseRevision: 0, draft: fresh, replaceInvalid: true })
    if (!result.ok) return { ok: false, message: 'Couldn’t reach the Workshop server.' }
    if (result.body.status !== 'saved') {
      return {
        ok: false,
        message: result.body.status === 'conflict' ? 'The saved draft changed meanwhile. Reload and try again.' : result.body.message,
      }
    }
    replaceDraft(fresh, result.body.revision, { type: 'DRAFT_RESTORED', draft: fresh })
    setPhase({ kind: 'ready' })
    return { ok: true }
  }

  return {
    phase,
    saveStatus,
    dispatch,
    currentEpoch: () => epochRef.current,
    reload: () => setLoadAttempt((attempt) => attempt + 1),
    retrySave: () => void saverRef.current?.flush(),
    overwriteAfterConflict: () => void saverRef.current?.overwriteAfterConflict(),
    startNewPuzzle,
    replaceInvalidDraft,
  }
}
