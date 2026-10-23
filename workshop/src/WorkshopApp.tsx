import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { candidateFingerprint } from './candidateFingerprint'
import { createDraftClient } from './draft/draftClient'
import type { DraftClient } from './draft/draftClient'
import { useWorkingDraft } from './draft/useWorkingDraft'
import { DraftGate } from './DraftGate'
import { DraftStatus } from './DraftStatus'
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
  createInitialWorkshopState,
  selectActivePriorityWords,
  selectApprovedFingerprint,
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

type CandidateWrite = { kind: 'save' } | { kind: 'remove'; saved: SavedCandidate; index: number }

/**
 * Saved Candidates as written to disk: a save still being written isn't
 * listed yet, and a removal still being written still is (where it was).
 */
function writtenSavedCandidates(saved: SavedCandidate[], writes: Record<string, CandidateWrite>): SavedCandidate[] {
  const entries = Object.entries(writes)
  if (entries.length === 0) return saved
  const view = saved.filter((entry) => writes[entry.fingerprint]?.kind !== 'save')
  for (const [, write] of entries) {
    if (write.kind === 'remove' && !view.some((entry) => entry.fingerprint === write.saved.fingerprint)) {
      view.splice(Math.min(write.index, view.length), 0, write.saved)
    }
  }
  return view
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record
  return rest
}

const hasSaved = (fingerprint: string) => (draft: WorkshopDraft) =>
  draft.savedCandidates.some((saved) => saved.fingerprint === fingerprint)

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
  const { workspace, candidateDetail, candidateDetailNavigation, navigate } = useWorkspaceRoute(production !== null)
  const [sourcing, setSourcing] = useState(false)
  // Guards against a second submission before the `sourcing` state re-renders.
  const sourcingInFlight = useRef(false)
  const [sourcingError, setSourcingError] = useState<{ label: string; message: string } | null>(null)
  // Candidate saves and removals being written, by fingerprint. The ref
  // turns away a second click before the state re-renders.
  const [writes, setWrites] = useState<Record<string, CandidateWrite>>({})
  const writing = useRef(new Set<string>())
  const [writeErrors, setWriteErrors] = useState<Record<string, string>>({})
  const [announcement, setAnnouncement] = useState('')
  const savedRef = useRef(draft.savedCandidates)
  savedRef.current = draft.savedCandidates
  const mainRef = useRef<HTMLElement>(null)
  const approveButtonRef = useRef<HTMLButtonElement>(null)
  const clueInputRef = useRef<HTMLInputElement>(null)
  const focusIntent = useRef<FocusIntent | null>(null)
  const previousWorkspace = useRef(workspace)
  const approvedId = selectApprovedFingerprint(draft)
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
    const signature = candidateFingerprint(finalPuzzle.candidate)
    let active = true
    void publisher
      .preview({ construction: finalPuzzle.candidate.construction, id: record.puzzleId, clue: finalPuzzle.inputs.clue })
      .then((result) => {
        if (!active || epoch !== currentEpoch()) return
        dispatch({ type: 'PUBLICATION_CHECKED', signature, outcome: classifyPublicationCheck(result, record) })
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

  function beginWrite(fingerprint: string, write: CandidateWrite): boolean {
    if (writing.current.has(fingerprint)) return false
    writing.current.add(fingerprint)
    setWrites((current) => ({ ...current, [fingerprint]: write }))
    setWriteErrors((current) => without(current, fingerprint))
    setAnnouncement('')
    return true
  }

  function endWrite(fingerprint: string) {
    writing.current.delete(fingerprint)
    setWrites((current) => without(current, fingerprint))
  }

  // Save Candidate: added to the draft now, shown as Saved once written.
  async function handleSave(candidate: PoolCandidate, index: number) {
    const fingerprint = candidateFingerprint(candidate)
    if (!batch || savedRef.current.some((saved) => saved.fingerprint === fingerprint)) return
    if (!beginWrite(fingerprint, { kind: 'save' })) return
    const epoch = currentEpoch()
    const saved: SavedCandidate = {
      fingerprint,
      candidate,
      origin: { batchSeed: batch.seed, number: index + 1, clue: batch.clue },
      savedAt: new Date().toISOString(),
      publication: null,
    }
    dispatch({ type: 'SAVE_CANDIDATE', saved })
    const result = await waitUntilSaved(hasSaved(fingerprint))
    // After New Puzzle or a reload, this candidate belongs to a draft that's gone.
    if (epoch !== currentEpoch()) return endWrite(fingerprint)
    if (result.ok) setAnnouncement(`Candidate ${index + 1} saved.`)
    else {
      dispatch({ type: 'REMOVE_SAVED_CANDIDATE', fingerprint })
      setWriteErrors((current) => ({ ...current, [fingerprint]: `Not saved: ${result.message} Try again.` }))
    }
    endWrite(fingerprint)
  }

  // Remove from Saved: dropped from the draft now, shown as gone once written.
  async function handleRemove(fingerprint: string, onRemoved: () => void) {
    const index = savedRef.current.findIndex((saved) => saved.fingerprint === fingerprint)
    if (index < 0 || fingerprint === approvedId) return
    const saved = savedRef.current[index]
    if (!beginWrite(fingerprint, { kind: 'remove', saved, index })) return
    const epoch = currentEpoch()
    dispatch({ type: 'REMOVE_SAVED_CANDIDATE', fingerprint })
    const result = await waitUntilSaved((written) => !hasSaved(fingerprint)(written))
    if (epoch !== currentEpoch()) return endWrite(fingerprint)
    if (result.ok) {
      // In the same update that takes it off the list, so the workspace can move on from it.
      onRemoved()
      setAnnouncement('Removed from Saved Candidates.')
    } else {
      dispatch({ type: 'RESTORE_SAVED_CANDIDATE', saved, index })
      setWriteErrors((current) => ({ ...current, [fingerprint]: `Not removed: ${result.message} Try again.` }))
    }
    endWrite(fingerprint)
  }

  function handleApprove(fingerprint: string) {
    if (writing.current.has(fingerprint)) return
    dispatch({ type: 'APPROVE_SAVED_CANDIDATE', fingerprint })
    navigate('final')
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
  function publishedHandler(signature: string, inputs: FinalPuzzleInputs) {
    const epoch = currentEpoch()
    return (confirmed: PublishedState) => {
      if (epoch === currentEpoch()) dispatch({ type: 'FINAL_PUZZLE_PUBLISHED', signature, inputs, published: confirmed })
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
    pending: Object.fromEntries(Object.entries(writes).map(([fingerprint, write]) => [fingerprint, write.kind])),
    errors: writeErrors,
    announcement,
    onSave: (candidate, index) => void handleSave(candidate, index),
    onRemove: (fingerprint, onRemoved) => void handleRemove(fingerprint, onRemoved),
  }
  // The Final Puzzle is labelled by its place in Saved Candidates.
  const approvedIndex = finalPuzzle ? savedCandidates.findIndex((saved) => saved.fingerprint === approvedId) : -1
  const finalNumber = approvedIndex >= 0 ? approvedIndex + 1 : (finalPuzzle?.number ?? 0)
  const finalPuzzleView = finalPuzzle && { ...finalPuzzle, number: finalNumber }
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
  } else if (workspace === 'final') {
    content =
      finalPuzzle && finalValidation ? (
        <FinalPuzzle
          candidate={finalPuzzle.candidate}
          number={finalNumber}
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
