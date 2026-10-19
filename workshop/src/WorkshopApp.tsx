import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { CandidateCard } from './CandidateCard'
import { CandidateDetail } from './CandidateDetail'
import { FinalPuzzle } from './FinalPuzzle'
import { createPublishingClient } from './publishing/publishingClient'
import { createProductionClient } from './production/productionClient'
import type { ProductionClient } from './production/productionClient'
import { PRODUCTION_OPS_ENABLED } from './production/productionOpsMode'
import { ProductionSchedule } from './ProductionSchedule'
import type { PublishingClient } from './publishing/publishingClient'
import { MAX_DISPLAYED_CANDIDATES, WORKSHOP_GENERATION_CONFIG, generateBatch } from './generateBatch'
import { MIN_USABLE_ANSWERS, RECOMMENDED_POOL_SIZE, buildPoolSummary } from './poolDiagnostics'
import type { DiagnosticSeverity } from './poolDiagnostics'
import { PoolReview } from './PoolReview'
import { PriorityWordsPicker } from './PriorityWordsPicker'
import { analyzePriorityWords } from './priorityWords'
import { createSourcingRequest } from './sourcing/contract'
import type { AbbreviationSetting, CandidateSource, ProperNounSetting, SourcingErrorCategory } from './sourcing/contract'
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
import type { PoolSource, SourceKind } from './state/workshopReducer'

// Pool summary, then errors, warnings and info, then Generate. Severity is
// spelled out in text so it never relies on color alone.
const SEVERITY_ORDER: DiagnosticSeverity[] = ['error', 'warning', 'info']
const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = { error: 'Error', warning: 'Warning', info: 'Note' }

// Session-only authoring loop: clue + word pool -> candidate batch ->
// select -> approve -> Final Puzzle -> validate -> export. Nothing here
// persists, publishes, or writes files; selection, approval, and the Final
// Puzzle's id/clue live only in this component's state, and a new batch
// clears them so approval never appears to outlive what it approved.
// Authoring and workflow state lives in workshopReducer (state/), split
// into the durable draft and session-only state; this component runs the
// side effects (sourcing, generation, publishing) and dispatches results.
//
// The pool comes either from the manual list or from candidate sourcing
// followed by human Pool Review; either way the same Pool Diagnostics
// decide whether Generate is allowed. Sourcing never starts generation, and
// a failed live request never falls back to the fixture. Each mode keeps its
// own Priority Words (see priorityWords.ts), which every generated candidate
// must contain; a selection missing from the pool blocks Generate.

const SOURCE_DESCRIPTION: Record<SourceKind, string> = {
  live: 'Live AI: candidates come from the model configured on the Workshop server. Each request is billed.',
  fixture: 'Development fixture: returns the same sample Dogs candidates for any clue. No AI provider is called.',
}

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

interface WorkshopAppProps {
  /** Injectable for tests; default to the live server endpoint and the deterministic fixture. */
  sources?: { live?: CandidateSource; fixture?: CandidateSource }
  /** Injectable for tests; defaults to the Workshop server's publishing endpoints. */
  publisher?: PublishingClient
  /** Production operations; null (the default outside Production-operations mode) hides them entirely. */
  production?: ProductionClient | null
}

export function WorkshopApp({ sources = {}, publisher = defaultPublisher, production = defaultProduction }: WorkshopAppProps = {}) {
  const candidateSources: Record<SourceKind, CandidateSource> = {
    live: sources.live ?? defaultLiveSource,
    fixture: sources.fixture ?? fixtureCandidateSource,
  }
  const [state, dispatch] = useReducer(workshopReducer, undefined, createInitialWorkshopState)
  const { draft, session } = state
  const { clue, poolSource, poolText, finalPuzzle } = draft
  const { context, properNouns, abbreviations, sourceKind, pool: sourcedPool } = draft.sourcing
  const { batch, selectedId, generationErrors: errors, stage, priorityLimitReached } = session
  const [sourcing, setSourcing] = useState(false)
  // Guards against a second submission before the `sourcing` state re-renders.
  const sourcingInFlight = useRef(false)
  const [sourcingError, setSourcingError] = useState<{ label: string; message: string } | null>(null)
  // Authoring state stays mounted in this component while the schedule is shown.
  const [view, setView] = useState<'authoring' | 'schedule'>('authoring')
  const approveButtonRef = useRef<HTMLButtonElement>(null)
  const returningToReview = useRef(false)
  const approvedId = selectApprovedId(draft)
  // `published` survives Back → reopen for the session (publishing is durable).
  const published = selectPublished(state)

  // Back from Final Puzzle returns focus to the approve control it came from.
  useEffect(() => {
    if (stage === 'review' && returningToReview.current) {
      returningToReview.current = false
      approveButtonRef.current?.focus()
    }
  }, [stage])

  const pool = useMemo(() => analyzeActivePool(poolSource, poolText, sourcedPool), [poolSource, poolText, sourcedPool])
  const activePriorityWords = selectActivePriorityWords(draft)
  const diagnostics = useMemo(
    () => [...pool.diagnostics, ...analyzePriorityWords(activePriorityWords, pool.usableAnswers)],
    [pool, activePriorityWords],
  )
  const canGenerate = !diagnostics.some((diagnostic) => diagnostic.severity === 'error')
  const summary = buildPoolSummary(pool.stats)
  const blockingIds = diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => `ws-diagnostic-${diagnostic.code}`)
    .join(' ')

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
    try {
      // The current Pool Review stays in place until a new one succeeds.
      const result = await sourceCandidates(candidateSources[sourceKind], request.request)
      if (result.ok) dispatch({ type: 'SOURCED_POOL_RECEIVED', pool: result.pool })
      else setSourcingError({ label: ERROR_LABEL[result.category], message: result.error })
    } finally {
      sourcingInFlight.current = false
      setSourcing(false)
    }
  }

  function handleSelectPoolSource(source: PoolSource) {
    dispatch({ type: 'SET_POOL_SOURCE', poolSource: source })
  }

  // Generation runs here, not in the reducer: it's timed, and the reducer stays pure.
  function handleGenerate(event: FormEvent) {
    event.preventDefault()
    const result = generateBatch(clue, pool, draft.generationCount + 1, activePriorityWords)
    dispatch(result.ok ? { type: 'GENERATION_SUCCEEDED', batch: result.batch } : { type: 'GENERATION_FAILED', errors: result.errors })
  }

  function handleApprove(candidate: PoolCandidate, number: number) {
    dispatch({ type: 'APPROVE_CANDIDATE', candidate, number })
  }

  function handleBack() {
    returningToReview.current = true
    dispatch({ type: 'RETURN_TO_REVIEW' })
  }

  const candidates = batch?.candidates ?? []
  const selectedIndex = candidates.findIndex((candidate) => candidate.identitySignature === selectedId)
  const selected = selectedIndex >= 0 ? candidates[selectedIndex] : null
  const approvedIndex = candidates.findIndex((candidate) => candidate.identitySignature === approvedId)

  const header = (
    <header className="ws-header">
      <h1>ClueCross Workshop</h1>
      <p className="ws-muted">Internal authoring tool. Not part of the ClueCross game.</p>
      {production && (
        <div className="ws-production-banner">
          <p>
            <strong>Production Operations Enabled.</strong> Production Preview, Publish, and the Production Schedule act on
            the live ClueCross calendar. Publishing to the dev calendar still targets dev.
          </p>
          <nav className="ws-nav" aria-label="Workshop">
            <button
              type="button"
              className="ws-button ws-button--secondary"
              aria-current={view === 'authoring' ? 'page' : undefined}
              onClick={() => setView('authoring')}
            >
              Authoring
            </button>
            <button
              type="button"
              className="ws-button ws-button--secondary"
              aria-current={view === 'schedule' ? 'page' : undefined}
              onClick={() => setView('schedule')}
            >
              Production Schedule
            </button>
          </nav>
        </div>
      )}
    </header>
  )

  if (production && view === 'schedule') {
    return (
      <div className="ws-app">
        {header}
        <ProductionSchedule client={production} />
      </div>
    )
  }

  // Review state stays in this component while Final Puzzle is shown, so
  // Back restores Candidate Review exactly as it was.
  if (stage === 'final' && finalPuzzle) {
    return (
      <div className="ws-app">
        {header}
        <FinalPuzzle
          candidate={finalPuzzle.candidate}
          number={finalPuzzle.number}
          inputs={finalPuzzle.inputs}
          onInputsChange={(inputs) => dispatch({ type: 'SET_FINAL_PUZZLE_INPUTS', inputs })}
          onBack={handleBack}
          publisher={publisher}
          production={production}
          published={published}
          onPublished={(confirmed) =>
            // The reducer ignores it if the author has since approved another candidate.
            dispatch({ type: 'FINAL_PUZZLE_PUBLISHED', signature: finalPuzzle.candidate.identitySignature, published: confirmed })
          }
        />
      </div>
    )
  }

  return (
    <div className="ws-app">
      {header}

      <form className="ws-panel ws-inputs" onSubmit={handleGenerate} noValidate>
        <h2 className="ws-panel__heading">Authoring inputs</h2>

        <div className="ws-field">
          <label htmlFor="ws-clue">Clue</label>
          <input id="ws-clue" type="text" value={clue} onChange={(event) => dispatch({ type: 'SET_CLUE', clue: event.target.value })} />
        </div>

        <fieldset className="ws-field ws-source">
          <legend>Candidate pool</legend>
          <label>
            <input
              type="radio"
              name="ws-pool-source"
              checked={poolSource === 'manual'}
              onChange={() => handleSelectPoolSource('manual')}
            />{' '}
            Enter manually
          </label>
          <label>
            <input
              type="radio"
              name="ws-pool-source"
              checked={poolSource === 'sourced'}
              onChange={() => handleSelectPoolSource('sourced')}
            />{' '}
            Source from clue
          </label>
        </fieldset>

        {poolSource === 'manual' ? (
          <div className="ws-field">
            <label htmlFor="ws-pool">Candidate words</label>
            <textarea
              id="ws-pool"
              rows={10}
              value={poolText}
              onChange={(event) => dispatch({ type: 'SET_POOL_TEXT', poolText: event.target.value })}
              aria-describedby="ws-pool-guidance ws-pool-summary"
              placeholder={'BEAGLE\nPOODLE\nCOLLIE\n…'}
              spellCheck={false}
            />
            <ul id="ws-pool-guidance" className="ws-guidance">
              <li>
                {WORKSHOP_GENERATION_CONFIG.minAnswers}–{WORKSHOP_GENERATION_CONFIG.maxAnswers} answers will be
                selected for a generated puzzle (never more than the number of candidate words).
              </li>
              <li>
                At least {MIN_USABLE_ANSWERS} unique valid words are required; {RECOMMENDED_POOL_SIZE}+ are recommended.
              </li>
              <li>All candidate words should already be considered valid answers to the clue.</li>
              <li>Separate words with new lines or commas. Multi-word answers are fine.</li>
              <li>Each answer must be 3–12 letters (spaces, hyphens, and apostrophes don’t count) to fit the 12×12 board.</li>
            </ul>
          </div>
        ) : (
          <div className="ws-field ws-sourcing">
            <label htmlFor="ws-context">Author context (optional)</label>
            <input
              id="ws-context"
              type="text"
              value={context}
              onChange={(event) => dispatch({ type: 'SET_SOURCING_CONTEXT', context: event.target.value })}
              aria-describedby="ws-context-hint"
            />
            <p id="ws-context-hint" className="ws-muted">
              Author-only clarification for sourcing. Never shown to players.
            </p>
            <div className="ws-sourcing__options">
              <label htmlFor="ws-proper-nouns">Proper nouns</label>
              <select
                id="ws-proper-nouns"
                value={properNouns}
                onChange={(event) => dispatch({ type: 'SET_PROPER_NOUNS', properNouns: event.target.value as ProperNounSetting })}
              >
                <option value="exclude">Exclude</option>
                <option value="allow">Allow</option>
              </select>
              <label htmlFor="ws-abbreviations">Abbreviations</label>
              <select
                id="ws-abbreviations"
                value={abbreviations}
                onChange={(event) =>
                  dispatch({ type: 'SET_ABBREVIATIONS', abbreviations: event.target.value as AbbreviationSetting })
                }
              >
                <option value="exclude">Exclude</option>
                <option value="allow">Allow</option>
              </select>
              <label htmlFor="ws-source-kind">Candidate source</label>
              <select
                id="ws-source-kind"
                value={sourceKind}
                onChange={(event) => dispatch({ type: 'SET_SOURCE_KIND', sourceKind: event.target.value as SourceKind })}
                disabled={sourcing}
                aria-describedby="ws-source-kind-hint"
              >
                <option value="live">Live AI</option>
                <option value="fixture">Development fixture</option>
              </select>
            </div>
            <p id="ws-source-kind-hint" className="ws-muted">
              {SOURCE_DESCRIPTION[sourceKind]}
            </p>
            <button
              type="button"
              className="ws-button ws-button--secondary"
              onClick={() => void handleSource()}
              disabled={sourcing}
            >
              {sourcing ? 'Sourcing…' : 'Source Candidates'}
            </button>
            <p className="ws-muted" role="status">
              {sourcing ? 'Sourcing candidates… a live request can take a minute or more.' : ''}
            </p>
            {sourcingError && (
              <div className="ws-errors" role="alert">
                <strong>{sourcingError.label}:</strong> {sourcingError.message}
                {sourcedPool && ' The previous Pool Review below is unchanged.'}
              </div>
            )}
            {sourcedPool && <PoolReview
                pool={sourcedPool}
                onToggleIncluded={(id, included) => dispatch({ type: 'SET_CANDIDATE_INCLUDED', id, included })}
              />}
          </div>
        )}

        <PriorityWordsPicker
          words={pool.usableAnswers}
          selected={activePriorityWords}
          limitReached={priorityLimitReached}
          onToggle={(word) => dispatch({ type: 'TOGGLE_PRIORITY_WORD', word })}
          onRemove={(word) => dispatch({ type: 'REMOVE_PRIORITY_WORD', word })}
        />

        <div id="ws-pool-summary" className="ws-pool-summary">
          <p className="ws-pool-summary__headline">{summary.headline}</p>
          <ul className="ws-pool-summary__bands">
            <li>{summary.short}</li>
            <li>{summary.medium}</li>
            <li>{summary.long}</li>
            <li>{summary.average}</li>
          </ul>
        </div>

        {SEVERITY_ORDER.map((severity) => {
          const ofSeverity = diagnostics.filter((diagnostic) => diagnostic.severity === severity)
          if (ofSeverity.length === 0) return null
          return (
            <ul key={severity} className={`ws-diagnostics ws-diagnostics--${severity}`}>
              {ofSeverity.map((diagnostic) => (
                <li key={diagnostic.code} id={`ws-diagnostic-${diagnostic.code}`}>
                  <strong>{SEVERITY_LABEL[severity]}:</strong> {diagnostic.message}
                  {diagnostic.entries && (
                    <details>
                      <summary>Show entries</summary>
                      <ul>
                        {diagnostic.entries.map((entry, index) => (
                          <li key={`${entry}-${index}`}>{entry}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )
        })}

        {errors.length > 0 && (
          <div className="ws-errors" role="alert">
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* aria-disabled rather than disabled, so the button stays focusable and
            its reason (the blocking error) is announced with it. */}
        <button
          type="submit"
          className="ws-button"
          aria-disabled={!canGenerate}
          aria-describedby={blockingIds || undefined}
        >
          Generate Candidates
        </button>
      </form>

      {batch && (
        <div className="ws-results">
          <section className="ws-panel ws-candidates" aria-labelledby="ws-candidates-heading">
            <h2 id="ws-candidates-heading" className="ws-panel__heading">
              Generated Candidates ({candidates.length})
            </h2>
            <p className="ws-meta" role="status">
              Clue “{batch.clue}” · {batch.pool.length} words · seed {batch.seed} ·{' '}
              {batch.diversity.subsetTrialsAttempted} trials, {batch.diversity.uniqueCandidateCount} unique
              {batch.diversity.uniqueCandidateCount > MAX_DISPLAYED_CANDIDATES &&
                ` (showing first ${MAX_DISPLAYED_CANDIDATES})`}{' '}
              · {Math.round(batch.elapsedMs)} ms
              {batch.priorityWords.length > 0 && ` · Priority Words: ${batch.priorityWords.join(', ')}`}
              {approvedIndex >= 0 && ` · Candidate ${approvedIndex + 1} approved`}
            </p>
            {candidates.length > 0 ? (
              <ul className="ws-card-grid">
                {candidates.map((candidate, index) => (
                  <li key={candidate.identitySignature}>
                    <CandidateCard
                      candidate={candidate}
                      number={index + 1}
                      isSelected={candidate.identitySignature === selectedId}
                      isApproved={candidate.identitySignature === approvedId}
                      onSelect={() => dispatch({ type: 'SELECT_CANDIDATE', id: candidate.identitySignature })}
                    />
                  </li>
                ))}
              </ul>
            ) : batch.priorityWords.length > 0 ? (
              <p>
                No candidates containing all Priority Words ({batch.priorityWords.join(', ')}) were found in this
                generation batch of {batch.diversity.subsetTrialsAttempted} trials. That doesn’t mean they can’t fit
                together — try generating again, removing a Priority Word, or adjusting your candidate word list.
              </p>
            ) : (
              <p>
                No valid candidates with {WORKSHOP_GENERATION_CONFIG.minAnswers}–{WORKSHOP_GENERATION_CONFIG.maxAnswers}{' '}
                answers were found in this batch. Try generating again, or add more (especially shorter) candidate
                words.
              </p>
            )}
          </section>

          <div className="ws-panel ws-detail-panel">
            {selected ? (
              <CandidateDetail
                candidate={selected}
                number={selectedIndex + 1}
                batchSeed={batch.seed}
                isApproved={selected.identitySignature === approvedId}
                onApprove={() => handleApprove(selected, selectedIndex + 1)}
                approveButtonRef={approveButtonRef}
              />
            ) : (
              <p className="ws-muted">Select a candidate to inspect it.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
