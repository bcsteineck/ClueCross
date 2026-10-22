import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { createDraftClient } from './draft/draftClient'
import type { DraftClient } from './draft/draftClient'
import { useWorkingDraft } from './draft/useWorkingDraft'
import { DraftGate } from './DraftGate'
import { DraftStatus } from './DraftStatus'
import { FinalPuzzle } from './FinalPuzzle'
import { prepareFinalPuzzle } from './finalPuzzle/finalPuzzle'
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
  selectApprovedId,
  selectPublished,
  workshopReducer,
} from './state/workshopReducer'
import type { PublicationCheck, SourceKind } from './state/workshopReducer'
import { AuthorWorkspace } from './workspaces/AuthorWorkspace'
import { CandidatesWorkspace } from './workspaces/CandidatesWorkspace'
import type { GenerateProps } from './workspaces/generateProps'
import { PublishWorkspace } from './workspaces/PublishWorkspace'

// Authoring loop: clue + word pool -> candidate batch -> select -> approve
// -> Final Puzzle -> validate -> publish or export, arranged as workspaces
// (Author, Candidates, Final Puzzle, Publish, and Production Schedule in
// Production-operations mode) inside WorkshopShell, chosen by the URL hash.
//
// This component owns everything that must survive moving between
// workspaces: the reducer (durable working draft + session state, see
// state/), the working-draft persistence (draft/useWorkingDraft), and the
// side effects (sourcing, generation, publishing). Workspaces only render
// and report intents, so switching never resets a batch, a selection, or an
// in-flight sourcing request. The current batch and its selection are
// session-only; a new batch still clears the Final Puzzle (now confirmed
// first) so approval never appears to outlive what it approved.
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
  const { dispatch, currentEpoch } = working
  const { clue, poolSource, poolText, finalPuzzle } = draft
  const { context, properNouns, abbreviations, sourceKind, pool: sourcedPool } = draft.sourcing
  const { batch, selectedId, generationErrors, priorityLimitReached } = session
  const { workspace, candidateDetail, candidateDetailNavigation, navigate } = useWorkspaceRoute(production !== null)
  const [sourcing, setSourcing] = useState(false)
  // Guards against a second submission before the `sourcing` state re-renders.
  const sourcingInFlight = useRef(false)
  const [sourcingError, setSourcingError] = useState<{ label: string; message: string } | null>(null)
  // Generate was asked for while a Final Puzzle exists; waiting for confirmation.
  const [confirmingGenerate, setConfirmingGenerate] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const approveButtonRef = useRef<HTMLButtonElement>(null)
  const clueInputRef = useRef<HTMLInputElement>(null)
  const focusIntent = useRef<FocusIntent | null>(null)
  const previousWorkspace = useRef(workspace)
  const approvedId = selectApprovedId(draft)
  // `published` survives navigation and reloads (publishing is durable).
  const published = selectPublished(state)

  // Moving to another workspace (a link, Back/Forward, or an action that
  // navigates) puts focus on its heading unless an action asked for a
  // specific control; an unanswered Generate confirmation is dropped.
  useEffect(() => {
    if (previousWorkspace.current === workspace) return
    previousWorkspace.current = workspace
    focusIntent.current ??= 'heading'
    setConfirmingGenerate(false)
  }, [workspace])

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
    const signature = finalPuzzle.candidate.identitySignature
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
  function runGenerate() {
    setConfirmingGenerate(false)
    const result = generateBatch(clue, pool, draft.generationCount + 1, activePriorityWords)
    dispatch(result.ok ? { type: 'GENERATION_SUCCEEDED', batch: result.batch } : { type: 'GENERATION_FAILED', errors: result.errors })
    if (result.ok) navigate('candidates')
  }

  function requestGenerate() {
    // Invalid inputs are reported where the author is; nothing is cleared.
    const errors = validateInputs(clue, pool, activePriorityWords)
    if (errors.length > 0) {
      setConfirmingGenerate(false)
      dispatch({ type: 'GENERATION_FAILED', errors })
      return
    }
    if (finalPuzzle) setConfirmingGenerate(true)
    else runGenerate()
  }

  // Stable, so the Candidates detail route can select its candidate in an effect.
  const handleSelect = useCallback((id: string) => dispatch({ type: 'SELECT_CANDIDATE', id }), [dispatch])

  function handleApprove(candidate: PoolCandidate, number: number) {
    dispatch({ type: 'APPROVE_CANDIDATE', candidate, number })
    navigate('final')
  }

  function handleBack() {
    focusIntent.current = 'approve'
    navigate('candidates')
  }

  // Captures the draft epoch when the Publish workspace renders: a publish
  // that completes after New Puzzle (or a reload) is dropped, even if the
  // new draft happens to approve the same layout again.
  function publishedHandler(signature: string) {
    const epoch = currentEpoch()
    return (confirmed: PublishedState) => {
      if (epoch === currentEpoch()) dispatch({ type: 'FINAL_PUZZLE_PUBLISHED', signature, published: confirmed })
    }
  }

  function handleNewPuzzleReset() {
    setSourcingError(null)
    setConfirmingGenerate(false)
    focusIntent.current = 'clue'
    navigate('author')
  }

  const generate: GenerateProps = {
    canGenerate,
    onGenerate: requestGenerate,
    confirm:
      confirmingGenerate && finalPuzzle
        ? {
            finalPuzzleLabel: `Approved Candidate ${finalPuzzle.number}${finalPuzzle.inputs.id.trim() ? ` · ${finalPuzzle.inputs.id.trim()}` : ''}`,
            published: published !== null,
          }
        : null,
    onConfirm: runGenerate,
    onCancel: () => setConfirmingGenerate(false),
  }
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
        selectedId={selectedId}
        approvedId={approvedId}
        finalPuzzle={finalPuzzle}
        generationErrors={generationErrors}
        onSelect={handleSelect}
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
          number={finalPuzzle.number}
          inputs={finalPuzzle.inputs}
          onInputsChange={(inputs) => dispatch({ type: 'SET_FINAL_PUZZLE_INPUTS', inputs })}
          onBack={handleBack}
          validation={finalValidation}
          published={published}
          notice={notice}
        />
      ) : (
        <section className="ws-panel ws-workspace" aria-label="Final Puzzle">
          <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
            Final Puzzle
          </h2>
          <div className="ws-empty">
            <p>
              <strong>No Final Puzzle has been approved.</strong> Select a candidate in Candidates and approve it to make
              it the Final Puzzle.
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
        finalPuzzle={finalPuzzle}
        validation={finalValidation}
        publisher={publisher}
        production={production}
        published={published}
        onPublished={publishedHandler(finalPuzzle?.candidate.identitySignature ?? '')}
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
            <NewPuzzleControl onConfirm={working.startNewPuzzle} onReset={handleNewPuzzleReset} />
          </div>
        )
      }
    >
      {content}
    </WorkshopShell>
  )
}
