import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { candidateFingerprint } from './candidateFingerprint'
import { createDraftClient } from './draft/draftClient'
import type { DraftClient } from './draft/draftClient'
import { useWorkingDraft } from './draft/useWorkingDraft'
import { DraftGate } from './DraftGate'
import { DraftStatus } from './DraftStatus'
import { createEditedVersion, isLocked, newCandidateId, savedCandidateName } from './editor/editedCandidate'
import type { EditorLayout } from './editor/editorLayout'
import { EditorWorkspace } from './editor/EditorWorkspace'
import { FinalPuzzle } from './FinalPuzzle'
import { prepareFinalPuzzle } from './finalPuzzle/finalPuzzle'
import type { FinalPuzzleInputs } from './finalPuzzle/finalPuzzle'
import { generateBatch, validateInputs } from './generateBatch'
import { NewPuzzleControl } from './NewPuzzleControl'
import { buildPoolSummary } from './poolDiagnostics'
import { analyzePriorityWords } from './priorityWords'
import { createProductionClient } from './production/productionClient'
import type { ProductionClient } from './production/productionClient'
import { PRODUCTION_OPS_ENABLED } from './production/productionOpsMode'
import { ProductionSchedule } from './ProductionSchedule'
import type { PreviewResponseBody, PublicationSummary, PublishedState } from './publishing/contract'
import { createPublishingClient } from './publishing/publishingClient'
import type { ClientResult, PublishingClient } from './publishing/publishingClient'
import { WORKSPACE_HASH, useWorkspaceRoute } from './shell/useWorkspaceRoute'
import { WorkshopShell } from './shell/WorkshopShell'
import { createSourcingRequest } from './sourcing/contract'
import type { CandidateSource, SourcingErrorCategory } from './sourcing/contract'
import { fixtureCandidateSource } from './sourcing/fixtureSource'
import { createLiveCandidateSource } from './sourcing/liveSource'
import { sourceCandidates } from './sourcing/sourceCandidates'
import {
  analyzeActivePool,
  approvalIssues,
  createInitialWorkshopState,
  selectActivePriorityWords,
  selectApprovedFingerprint,
  selectApprovedId,
  selectPublished,
  workshopReducer,
} from './state/workshopReducer'
import type { CandidateTab, PublicationCheck, SavedCandidate, SourceKind, WorkshopDraft } from './state/workshopReducer'
import { AuthorWorkspace } from './workspaces/AuthorWorkspace'
import { CandidatesWorkspace } from './workspaces/CandidatesWorkspace'
import type { CandidateOps } from './workspaces/CandidatesWorkspace'
import type { GenerateProps } from './workspaces/generateProps'
import { PublishWorkspace } from './workspaces/PublishWorkspace'

// Authoring loop: clue + word pool -> candidate batch -> save -> approve a
// saved candidate -> Final Puzzle -> validate -> publish or export, arranged as workspaces
// (Author, Candidates, Final Puzzle, Publish, and Production Schedule in
// Production-operations mode) inside WorkshopShell, chosen by the URL hash.
//
// This component owns everything that must survive moving between
// workspaces: the reducer (durable working draft + session state, see
// state/), the working-draft persistence (draft/useWorkingDraft), and the
// side effects (sourcing, generation, publishing). Workspaces only render
// and report intents, so switching never resets a batch, a selection, or an
// in-flight sourcing request. The current batch is session-only; Saved
// Candidates and the Final Puzzle are in the working draft, and a new batch
// leaves both alone.
//
// Saving or removing a candidate is applied to the draft at once and goes
// through the same autosave queue as every other change (so the two can't
// overwrite each other), but it is only shown as done once that write
// succeeds (useWorkingDraft's waitUntilSaved): until then the candidate
// reads Saving… or Removing…, its other actions and New Puzzle wait, and
// leaving the page asks first. A write that fails is undone in the draft
// and explained beside the action, which can then be tried again.
const ERROR_LABEL: Record<SourcingErrorCategory, string> = {
  configuration: 'Configuration error',
  provider: 'Provider error',
  response: 'Response error',
  request: 'Request error',
}

const defaultLiveSource = createLiveCandidateSource()
const defaultPublisher = createPublishingClient()
// Only a Workshop started with `npm run workshop:production-ops` has one.
const defaultProduction = PRODUCTION_OPS_ENABLED ? createProductionClient() : null
const defaultDrafts = createDraftClient()

const PUBLICATION_NOTICE: Record<PublicationCheck, string> = {
  checking: 'Restored from the working draft as published to the dev calendar. Checking with the dev calendar…',
  confirmed: 'Restored from the working draft. The dev calendar still has this puzzle, so its ID and clue stay locked.',
  'not-found':
    'This Final Puzzle was recorded as published to the dev calendar, but the dev calendar no longer has a puzzle with its ID, so the ID and clue are unlocked.',
  unconfirmed:
    'Restored from the working draft as published to the dev calendar, but the dev calendar couldn’t confirm it right now. The ID and clue stay locked.',
}

/** Re-checks a restored publication record against the dev calendar's own answer. */
function classifyPublicationCheck(
  result: ClientResult<PreviewResponseBody>,
  record: PublicationSummary,
): Exclude<PublicationCheck, 'checking'> {
  if (!result.ok) return 'unconfirmed'
  const { body } = result
  if (body.status === 'estimate') return 'not-found'
  if (
    body.status === 'existing' &&
    body.publication.puzzleId === record.puzzleId &&
    body.publication.contentFingerprint === record.contentFingerprint
  ) {
    return 'confirmed'
  }
  return 'unconfirmed'
}

/** Where focus goes after the next render: a workspace heading, or a specific control. */
type FocusIntent = 'heading' | 'approve' | 'clue'

// Writes are keyed by what they act on: a batch candidate's fingerprint
// (save), a saved candidate's id (remove), or the saved candidate an
// edited copy is being made from (edit).
type CandidateWrite =
  | { kind: 'save'; id: string }
  | { kind: 'remove'; saved: SavedCandidate; index: number }
  | { kind: 'edit'; id: string }

/**
 * Saved Candidates as written to disk: a save (or a new edited copy) still
 * being written isn't listed yet, and a removal still being written still
 * is (where it was).
 */
function writtenSavedCandidates(saved: SavedCandidate[], writes: Record<string, CandidateWrite>): SavedCandidate[] {
  const entries = Object.values(writes)
  if (entries.length === 0) return saved
  const unwritten = new Set(entries.flatMap((write) => (write.kind === 'remove' ? [] : [write.id])))
  const view = saved.filter((entry) => !unwritten.has(entry.id))
  for (const write of entries) {
    if (write.kind === 'remove' && !view.some((entry) => entry.id === write.saved.id)) {
      view.splice(Math.min(write.index, view.length), 0, write.saved)
    }
  }
  return view
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record
  return rest
}

const hasSaved = (id: string) => (draft: WorkshopDraft) => draft.savedCandidates.some((saved) => saved.id === id)

/** Why an approved or published version opens read-only in the Editor. */
function lockedReason(saved: SavedCandidate, approvedId: string | null): string | null {
  if (saved.id === approvedId) {
    return 'It’s the approved Final Puzzle. Edit a new copy instead, and approve that copy if it should replace the Final Puzzle.'
  }
  if (saved.publication) {
    return 'It was published to the dev calendar. Edit a new copy instead; the copy starts unpublished.'
  }
  return null
}

interface WorkshopAppProps {
  /** Injectable for tests; default to the live server endpoint and the deterministic fixture. */
  sources?: { live?: CandidateSource; fixture?: CandidateSource }
  /** Injectable for tests; defaults to the Workshop server's publishing endpoints. */
  publisher?: PublishingClient
  /** Production operations; null (the default outside Production-operations mode) hides them entirely. */
  production?: ProductionClient | null
  /** Injectable for tests; defaults to the Workshop server's working-draft endpoint. */
  drafts?: DraftClient
}

export function WorkshopApp({
  sources = {},
  publisher = defaultPublisher,
  production = defaultProduction,
  drafts = defaultDrafts,
}: WorkshopAppProps = {}) {
  const candidateSources: Record<SourceKind, CandidateSource> = {
    live: sources.live ?? defaultLiveSource,
    fixture: sources.fixture ?? fixtureCandidateSource,
  }
  const [state, rawDispatch] = useReducer(workshopReducer, undefined, createInitialWorkshopState)
  const { draft, session } = state
  const working = useWorkingDraft(drafts, draft, rawDispatch)
  const { dispatch, currentEpoch, waitUntilSaved } = working
  const { clue, poolSource, poolText, finalPuzzle } = draft
  const { context, properNouns, abbreviations, sourceKind, pool: sourcedPool } = draft.sourcing
  const { batch, candidateTab, selectedId, savedSelectedId, generationErrors, priorityLimitReached } = session
  const { workspace, candidateDetail, editorId, candidateDetailNavigation, navigate, openEditor } = useWorkspaceRoute(
    production !== null,
  )
  const [sourcing, setSourcing] = useState(false)
  // Guards against a second submission before the `sourcing` state re-renders.
  const sourcingInFlight = useRef(false)
  const [sourcingError, setSourcingError] = useState<{ label: string; message: string } | null>(null)
  // Candidate saves, removals, and new edited copies being written (see CandidateWrite). The ref
  // turns away a second click before the state re-renders.
  const [writes, setWrites] = useState<Record<string, CandidateWrite>>({})
  const writing = useRef(new Set<string>())
  const [writeErrors, setWriteErrors] = useState<Record<string, string>>({})
  const [announcement, setAnnouncement] = useState('')
  const savedRef = useRef(draft.savedCandidates)
  savedRef.current = draft.savedCandidates
  const mainRef = useRef<HTMLElement>(null)
  const approveButtonRef = useRef<HTMLButtonElement>(null)
  // The edited version last open in the Editor (session-only), for the Editor link.
  const lastEditorId = useRef<string | null>(null)
  const clueInputRef = useRef<HTMLInputElement>(null)
  const focusIntent = useRef<FocusIntent | null>(null)
  const previousWorkspace = useRef(workspace)
  const approvedId = selectApprovedId(draft)
  const approvedFingerprint = selectApprovedFingerprint(draft)
  // Current Batch marks a layout Approved only when the approved entry is that generated layout.
  const approvedBatchFingerprint = draft.savedCandidates.some((saved) => saved.id === approvedId && !saved.edit)
    ? approvedFingerprint
    : null
  const savedCandidates = useMemo(() => writtenSavedCandidates(draft.savedCandidates, writes), [draft.savedCandidates, writes])
  const writeInProgress = Object.keys(writes).length > 0
  // `published` survives navigation and reloads (publishing is durable).
  const published = selectPublished(state)

  // Moving to another workspace (a link, Back/Forward, or an action that
  // navigates) puts focus on its heading unless an action asked for a
  // specific control.
  useEffect(() => {
    if (previousWorkspace.current === workspace) return
    previousWorkspace.current = workspace
    focusIntent.current ??= 'heading'
  }, [workspace])

  // The browser's own "leave site?" prompt while a candidate write is unfinished.
  useEffect(() => {
    if (!writeInProgress) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [writeInProgress])

  useEffect(() => {
    const intent = focusIntent.current
    if (!intent) return
    const target =
      intent === 'clue'
        ? clueInputRef.current
        : intent === 'approve'
          ? approveButtonRef.current
          : mainRef.current?.querySelector<HTMLElement>('[data-workspace-heading]')
    if (target) {
      focusIntent.current = null
      target.focus()
    }
  })

  // A Final Puzzle restored with a dev-calendar publication record keeps
  // its lock, but the record is re-checked with the dev calendar rather
  // than trusted: if the calendar no longer has that ID, the lock is lifted.
  const publicationCheck = session.publicationCheck
  useEffect(() => {
    const record = finalPuzzle?.publication?.publication
    if (publicationCheck !== 'checking' || !finalPuzzle || !record) return
    const epoch = currentEpoch()
    const savedId = finalPuzzle.savedId
    let active = true
    void publisher
      .preview({ construction: finalPuzzle.candidate.construction, id: record.puzzleId, clue: finalPuzzle.inputs.clue })
      .then((result) => {
        if (!active || epoch !== currentEpoch()) return
        dispatch({ type: 'PUBLICATION_CHECKED', savedId, outcome: classifyPublicationCheck(result, record) })
      })
    return () => {
      active = false
    }
  }, [publicationCheck, finalPuzzle, publisher, currentEpoch, dispatch])

  const pool = useMemo(() => analyzeActivePool(poolSource, poolText, sourcedPool), [poolSource, poolText, sourcedPool])
  const activePriorityWords = selectActivePriorityWords(draft)
  const diagnostics = useMemo(
    () => [...pool.diagnostics, ...analyzePriorityWords(activePriorityWords, pool.usableAnswers)],
    [pool, activePriorityWords],
  )
  const canGenerate = !diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  const summary = buildPoolSummary(pool.stats)

  // Shared by Final Puzzle and Publish: the same assembly and validation
  // the server repeats before publishing.
  const finalCandidate = finalPuzzle?.candidate
  const finalInputs = finalPuzzle?.inputs
  const finalValidation = useMemo(
    () => (finalCandidate && finalInputs ? prepareFinalPuzzle(finalCandidate.construction, finalInputs) : null),
    [finalCandidate, finalInputs],
  )

  async function handleSource() {
    if (sourcingInFlight.current) return
    const request = createSourcingRequest({ clue, context, properNouns, abbreviations })
    if (!request.ok) {
      setSourcingError({ label: 'Error', message: request.error })
      return
    }
    sourcingInFlight.current = true
    setSourcingError(null)
    setSourcing(true)
    // A response that arrives after the draft was replaced (New Puzzle) belongs to the old puzzle.
    const epoch = currentEpoch()
    try {
      // The current Pool Review stays in place until a new one succeeds.
      const result = await sourceCandidates(candidateSources[sourceKind], request.request)
      if (epoch !== currentEpoch()) return
      if (result.ok) dispatch({ type: 'SOURCED_POOL_RECEIVED', pool: result.pool })
      else setSourcingError({ label: ERROR_LABEL[result.category], message: result.error })
    } finally {
      sourcingInFlight.current = false
      setSourcing(false)
    }
  }

  // Generation runs here, not in the reducer: it's timed, and the reducer
  // stays pure. It is synchronous, so no reset can land mid-generation.
  // Author and Candidates both call requestGenerate.
  // A new batch replaces only the unsaved one, so there's nothing to confirm.
  function requestGenerate() {
    // Invalid inputs are reported where the author is; nothing is cleared.
    const errors = validateInputs(clue, pool, activePriorityWords)
    if (errors.length > 0) {
      dispatch({ type: 'GENERATION_FAILED', errors })
      return
    }
    const result = generateBatch(clue, pool, draft.generationCount + 1, activePriorityWords)
    dispatch(result.ok ? { type: 'GENERATION_SUCCEEDED', batch: result.batch } : { type: 'GENERATION_FAILED', errors: result.errors })
    if (result.ok) navigate('candidates')
  }

  // Stable, so the Candidates detail route can select its candidate in an effect.
  const handleSelect = useCallback(
    (tab: CandidateTab, id: string) => dispatch(tab === 'saved' ? { type: 'SELECT_SAVED_CANDIDATE', id } : { type: 'SELECT_CANDIDATE', id }),
    [dispatch],
  )
  const handleTabChange = useCallback((tab: CandidateTab) => dispatch({ type: 'SET_CANDIDATE_TAB', tab }), [dispatch])

  function beginWrite(key: string, write: CandidateWrite): boolean {
    if (writing.current.has(key)) return false
    writing.current.add(key)
    setWrites((current) => ({ ...current, [key]: write }))
    setWriteErrors((current) => without(current, key))
    setAnnouncement('')
    return true
  }

  function endWrite(key: string) {
    writing.current.delete(key)
    setWrites((current) => without(current, key))
  }

  // Save Candidate: added to the draft now, shown as Saved once written.
  async function handleSave(candidate: PoolCandidate, index: number) {
    const fingerprint = candidateFingerprint(candidate)
    if (!batch || savedRef.current.some((saved) => !saved.edit && saved.fingerprint === fingerprint)) return
    const id = newCandidateId()
    if (!beginWrite(fingerprint, { kind: 'save', id })) return
    const epoch = currentEpoch()
    const saved: SavedCandidate = {
      id,
      name: null,
      fingerprint,
      candidate,
      origin: { batchSeed: batch.seed, number: index + 1, clue: batch.clue },
      savedAt: new Date().toISOString(),
      publication: null,
      edit: null,
    }
    dispatch({ type: 'SAVE_CANDIDATE', saved })
    const result = await waitUntilSaved(hasSaved(id))
    // After New Puzzle or a reload, this candidate belongs to a draft that's gone.
    if (epoch !== currentEpoch()) return endWrite(fingerprint)
    if (result.ok) setAnnouncement(`Candidate ${index + 1} saved.`)
    else {
      dispatch({ type: 'REMOVE_SAVED_CANDIDATE', id })
      setWriteErrors((current) => ({ ...current, [fingerprint]: `Not saved: ${result.message} Try again.` }))
    }
    endWrite(fingerprint)
  }

  // Remove from Saved: dropped from the draft now, shown as gone once written.
  // Only that entry goes: its source, parent, and other versions stay.
  async function handleRemove(id: string, onRemoved: () => void) {
    const index = savedRef.current.findIndex((saved) => saved.id === id)
    if (index < 0 || id === approvedId) return
    const saved = savedRef.current[index]
    if (!beginWrite(id, { kind: 'remove', saved, index })) return
    const epoch = currentEpoch()
    dispatch({ type: 'REMOVE_SAVED_CANDIDATE', id })
    const result = await waitUntilSaved((written) => !hasSaved(id)(written))
    if (epoch !== currentEpoch()) return endWrite(id)
    if (result.ok) {
      // In the same update that takes it off the list, so the workspace can move on from it.
      onRemoved()
      setAnnouncement('Removed from Saved Candidates.')
    } else {
      dispatch({ type: 'RESTORE_SAVED_CANDIDATE', saved, index })
      setWriteErrors((current) => ({ ...current, [id]: `Not removed: ${result.message} Try again.` }))
    }
    endWrite(id)
  }

  function handleApprove(id: string) {
    if (writing.current.has(id)) return
    const saved = savedRef.current.find((entry) => entry.id === id)
    // Approval checks the layout as it is now (an edited one may be incomplete).
    if (!saved || approvalIssues(saved).length > 0) return
    dispatch({ type: 'APPROVE_SAVED_CANDIDATE', id })
    navigate('final')
  }

  /**
   * A new edited version copied from `source`, written to the working draft
   * before anything switches to it. Resolves with its id, or why it wasn't saved
   * (it is then taken out of the draft again).
   */
  async function createVersion(source: SavedCandidate, layout?: EditorLayout): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
    const sourceIndex = savedRef.current.findIndex((entry) => entry.id === source.id)
    const id = newCandidateId()
    const entry = createEditedVersion(
      source,
      { id, savedAt: new Date().toISOString(), saved: savedRef.current, sourceIndex, priorityWords: activePriorityWords },
      layout,
    )
    if (!entry) return { ok: false, message: 'This candidate has no layout to edit.' }
    const epoch = currentEpoch()
    dispatch({ type: 'CREATE_EDITED_CANDIDATE', saved: entry })
    const result = await waitUntilSaved(hasSaved(id))
    if (epoch !== currentEpoch()) return { ok: false, message: 'The working draft was replaced.' }
    if (!result.ok) {
      dispatch({ type: 'REMOVE_SAVED_CANDIDATE', id })
      return result
    }
    return { ok: true, id }
  }

  // Edit Candidate: an unapproved, unpublished edited version reopens as
  // it is; anything else (a generated candidate, or a locked version) is
  // first copied into a new edited version, saved, and then opened.
  async function handleEdit(sourceId: string) {
    const source = savedRef.current.find((entry) => entry.id === sourceId)
    if (!source) return
    if (source.edit && !isLocked(source, approvedId)) {
      openEditor(source.id)
      return
    }
    if (!beginWrite(sourceId, { kind: 'edit', id: sourceId })) return
    const result = await createVersion(source)
    endWrite(sourceId)
    if (!result.ok) {
      if (result.message !== 'The working draft was replaced.') {
        setWriteErrors((current) => ({ ...current, [sourceId]: `No edited copy was made: ${result.message} Try again.` }))
      }
      return
    }
    openEditor(result.id)
  }

  // Save as New Candidate: the Editor switches only once the new version is written.
  async function handleSaveAsNew(sourceId: string, layout: EditorLayout): Promise<{ ok: true } | { ok: false; message: string }> {
    const source = savedRef.current.find((entry) => entry.id === sourceId)
    if (!source?.edit) return { ok: false, message: 'This version is no longer saved.' }
    const result = await createVersion(source, layout)
    if (!result.ok) return result
    openEditor(result.id)
    setAnnouncement(`Saved as a new candidate.`)
    return { ok: true }
  }

  // Back to Saved Candidates: the Editor's unfinished operation ends with
  // it; completed edits are already in the autosave queue.
  function handleEditorBack(id: string) {
    dispatch({ type: 'SET_CANDIDATE_TAB', tab: 'saved' })
    dispatch({ type: 'SELECT_SAVED_CANDIDATE', id })
    focusIntent.current = 'approve'
    navigate('candidates')
  }

  // Back to Candidate Review: Saved Candidates, on the approved candidate.
  function handleBack() {
    if (approvedId) {
      dispatch({ type: 'SET_CANDIDATE_TAB', tab: 'saved' })
      dispatch({ type: 'SELECT_SAVED_CANDIDATE', id: approvedId })
    }
    focusIntent.current = 'approve'
    navigate('candidates')
  }

  function handleClearFinal() {
    dispatch({ type: 'CLEAR_FINAL_PUZZLE' })
    focusIntent.current = 'heading'
  }

  // Captures the draft epoch when the Publish workspace renders: a publish
  // that completes after New Puzzle (or a reload) is dropped, even if the
  // new draft happens to approve the same layout again. The ID and clue are
  // the ones being published, kept with the record if the author approves
  // another candidate before the publish completes.
  function publishedHandler(savedId: string, inputs: FinalPuzzleInputs) {
    const epoch = currentEpoch()
    return (confirmed: PublishedState) => {
      if (epoch === currentEpoch()) dispatch({ type: 'FINAL_PUZZLE_PUBLISHED', savedId, inputs, published: confirmed })
    }
  }

  function handleNewPuzzleReset() {
    setSourcingError(null)
    setWriteErrors({})
    setAnnouncement('')
    focusIntent.current = 'clue'
    navigate('author')
  }

  const generate: GenerateProps = { canGenerate, onGenerate: requestGenerate }
  const ops: CandidateOps = {
    pending: Object.fromEntries(Object.entries(writes).map(([key, write]) => [key, write.kind])),
    errors: writeErrors,
    announcement,
    onSave: (candidate, index) => void handleSave(candidate, index),
    onRemove: (id, onRemoved) => void handleRemove(id, onRemoved),
    onEdit: (id) => void handleEdit(id),
  }
  // The Final Puzzle is labelled by its place (or name) in Saved Candidates.
  const approvedIndex = finalPuzzle ? savedCandidates.findIndex((saved) => saved.id === approvedId) : -1
  const finalNumber = approvedIndex >= 0 ? approvedIndex + 1 : (finalPuzzle?.number ?? 0)
  const finalPuzzleView = finalPuzzle && { ...finalPuzzle, number: finalNumber }
  const finalLabel =
    approvedIndex >= 0 ? savedCandidateName(savedCandidates[approvedIndex], approvedIndex) : `Candidate ${finalNumber}`

  // The Editor link opens the version last edited this session, if it's still saved.
  const editorEntryIndex = editorId === null ? -1 : draft.savedCandidates.findIndex((saved) => saved.id === editorId)
  if (editorEntryIndex >= 0) lastEditorId.current = editorId
  useEffect(() => {
    if (workspace !== 'editor' || editorId !== null || working.phase.kind !== 'ready') return
    const last = lastEditorId.current
    if (last && savedRef.current.some((saved) => saved.id === last && saved.edit)) openEditor(last, { replace: true })
  }, [workspace, editorId, working.phase.kind, openEditor])
  const notice = publicationCheck ? PUBLICATION_NOTICE[publicationCheck] : null
  const ready = working.phase.kind === 'ready'

  let content
  if (working.phase.kind !== 'ready') {
    content = <DraftGate phase={working.phase} onRetry={working.reload} onReplaceInvalid={working.replaceInvalidDraft} />
  } else if (workspace === 'schedule' && production) {
    content = <ProductionSchedule client={production} />
  } else if (workspace === 'candidates') {
    content = (
      <CandidatesWorkspace
        batch={batch}
        savedCandidates={savedCandidates}
        tab={candidateTab}
        onTabChange={handleTabChange}
        selectedId={selectedId}
        savedSelectedId={savedSelectedId}
        onSelect={handleSelect}
        approvedId={approvedId}
        approvedBatchFingerprint={approvedBatchFingerprint}
        finalPuzzle={finalPuzzleView}
        currentClue={clue}
        generationErrors={generationErrors}
        ops={ops}
        onApprove={handleApprove}
        onOpenFinal={() => navigate('final')}
        approveButtonRef={approveButtonRef}
        generate={generate}
        candidateDetail={candidateDetail}
        detailNavigation={candidateDetailNavigation}
      />
    )
  } else if (workspace === 'editor') {
    const entry = editorEntryIndex >= 0 ? draft.savedCandidates[editorEntryIndex] : null
    if (entry?.edit) {
      const edit = entry.edit
      const parentIndex = edit.parentId ? draft.savedCandidates.findIndex((saved) => saved.id === edit.parentId) : -1
      const parent =
        parentIndex >= 0
          ? ` · copied from ${savedCandidateName(draft.savedCandidates[parentIndex], parentIndex)}`
          : edit.parentId
            ? ' · copied from an earlier version (since removed)'
            : ''
      content = (
        <EditorWorkspace
          key={entry.id}
          edit={edit}
          name={savedCandidateName(entry, editorEntryIndex)}
          customName={entry.name ?? ''}
          context={`Edited version of ${edit.sourceLabel}${parent}. The original candidate is unchanged.`}
          locked={lockedReason(entry, approvedId)}
          saveStatus={working.saveStatus}
          onCommit={(layout) => dispatch({ type: 'UPDATE_EDITED_LAYOUT', id: entry.id, layout })}
          onRename={(name) => dispatch({ type: 'RENAME_SAVED_CANDIDATE', id: entry.id, name })}
          onSaveAsNew={(layout) => handleSaveAsNew(entry.id, layout)}
          onEditCopy={() => void handleEdit(entry.id)}
          onBack={() => handleEditorBack(entry.id)}
        />
      )
    } else {
      content = (
        <section className="ws-workspace" aria-label="Editor">
          <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
            Editor
          </h2>
          <div className="ws-panel ws-empty">
            <p>
              <strong>
                {editorId === null
                  ? 'No candidate is open in the Editor.'
                  : entry
                    ? 'This saved candidate isn’t an edited version.'
                    : 'This edited candidate no longer exists.'}
              </strong>{' '}
              {entry
                ? 'Choose Edit Candidate in Saved Candidates to make an edited copy of it.'
                : 'Choose Edit Candidate on a saved candidate to edit it.'}
            </p>
            <button
              type="button"
              className="ws-button ws-button--secondary"
              onClick={() => {
                dispatch({ type: 'SET_CANDIDATE_TAB', tab: 'saved' })
                navigate('candidates')
              }}
            >
              Go to Saved Candidates
            </button>
          </div>
        </section>
      )
    }
  } else if (workspace === 'final') {
    content =
      finalPuzzle && finalValidation ? (
        <FinalPuzzle
          candidate={finalPuzzle.candidate}
          number={finalNumber}
          label={finalLabel}
          inputs={finalPuzzle.inputs}
          onInputsChange={(inputs) => dispatch({ type: 'SET_FINAL_PUZZLE_INPUTS', inputs })}
          onBack={handleBack}
          onClear={handleClearFinal}
          validation={finalValidation}
          published={published}
          notice={notice}
        />
      ) : (
        <section className="ws-workspace" aria-label="Final Puzzle">
          <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
            Final Puzzle
          </h2>
          <div className="ws-panel ws-empty">
            <p>
              <strong>No Final Puzzle has been approved.</strong> Save candidates in Candidates, then approve one from
              Saved Candidates to make it the Final Puzzle.
            </p>
            <a className="ws-button ws-button--secondary" href={WORKSPACE_HASH.candidates}>
              Go to Candidates
            </a>
          </div>
        </section>
      )
  } else if (workspace === 'publish') {
    content = (
      <PublishWorkspace
        finalPuzzle={finalPuzzleView}
        label={finalLabel}
        validation={finalValidation}
        publisher={publisher}
        production={production}
        published={published}
        onPublished={publishedHandler(approvedId ?? '', finalPuzzle?.inputs ?? { id: '', clue: '' })}
        notice={notice}
      />
    )
  } else {
    content = (
      <AuthorWorkspace
        draft={draft}
        dispatch={dispatch}
        pool={pool}
        diagnostics={diagnostics}
        summary={summary}
        activePriorityWords={activePriorityWords}
        priorityLimitReached={priorityLimitReached}
        generationErrors={generationErrors}
        sourcing={sourcing}
        sourcingError={sourcingError}
        onSource={() => void handleSource()}
        clueInputRef={clueInputRef}
        generate={generate}
      />
    )
  }

  return (
    <WorkshopShell
      workspace={workspace}
      production={production !== null}
      navigation={ready}
      onNavigate={navigate}
      mainRef={mainRef}
      statusBar={
        ready && (
          <div className="ws-statusbar">
            <DraftStatus
              status={working.saveStatus}
              onRetry={working.retrySave}
              onReload={working.reload}
              onOverwrite={working.overwriteAfterConflict}
            />
            <NewPuzzleControl
              onConfirm={working.startNewPuzzle}
              onReset={handleNewPuzzleReset}
              blockedReason={writeInProgress ? 'Wait for the candidate being saved or removed to finish.' : null}
            />
          </div>
        )
      }
    >
      {content}
    </WorkshopShell>
  )
}
