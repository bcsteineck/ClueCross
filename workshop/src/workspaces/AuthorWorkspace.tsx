import type { Dispatch, FormEvent, RefObject } from 'react'
import { WORKSHOP_GENERATION_CONFIG } from '../generateBatch'
import { MIN_USABLE_ANSWERS, RECOMMENDED_POOL_SIZE } from '../poolDiagnostics'
import type { CandidatePoolAnalysis, DiagnosticSeverity, PoolDiagnostic } from '../poolDiagnostics'
import type { buildPoolSummary } from '../poolDiagnostics'
import { PoolReview } from '../PoolReview'
import { PriorityWordsPicker } from '../PriorityWordsPicker'
import type { AbbreviationSetting, ProperNounSetting } from '../sourcing/contract'
import type { PoolSource, SourceKind, WorkshopAction, WorkshopDraft } from '../state/workshopReducer'
import { GenerateControl } from './GenerateControl'
import type { GenerateProps } from './generateProps'

// Pool summary, then errors, warnings and info, then Generate. Severity is
// spelled out in text so it never relies on color alone.
const SEVERITY_ORDER: DiagnosticSeverity[] = ['error', 'warning', 'info']
const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = { error: 'Error', warning: 'Warning', info: 'Note' }

const SOURCE_DESCRIPTION: Record<SourceKind, string> = {
  live: 'Live AI: candidates come from the model configured on the Workshop server. Each request is billed.',
  fixture: 'Development fixture: returns the same sample Dogs candidates for any clue. No AI provider is called.',
}

interface AuthorWorkspaceProps {
  draft: WorkshopDraft
  dispatch: Dispatch<WorkshopAction>
  pool: CandidatePoolAnalysis
  diagnostics: PoolDiagnostic[]
  summary: ReturnType<typeof buildPoolSummary>
  activePriorityWords: string[]
  priorityLimitReached: boolean
  /** Errors from the last refused Generate. */
  generationErrors: string[]
  sourcing: boolean
  sourcingError: { label: string; message: string } | null
  onSource: () => void
  clueInputRef: RefObject<HTMLInputElement | null>
  generate: GenerateProps
}

// Author: everything that defines a batch request — clue, authoring mode,
// the manual word list or a sourced and reviewed pool, Priority Words, the
// pool diagnostics — and Generate. The pool comes either from the manual
// list or from candidate sourcing followed by human Pool Review; either way
// the same Pool Diagnostics decide whether Generate is allowed. Sourcing
// never starts generation, and a failed live request never falls back to
// the fixture.
export function AuthorWorkspace({
  draft,
  dispatch,
  pool,
  diagnostics,
  summary,
  activePriorityWords,
  priorityLimitReached,
  generationErrors,
  sourcing,
  sourcingError,
  onSource,
  clueInputRef,
  generate,
}: AuthorWorkspaceProps) {
  const { clue, poolSource, poolText } = draft
  const { context, properNouns, abbreviations, sourceKind, pool: sourcedPool } = draft.sourcing
  const blockingIds = diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => `ws-diagnostic-${diagnostic.code}`)
    .join(' ')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    generate.onGenerate()
  }

  const selectPoolSource = (source: PoolSource) => dispatch({ type: 'SET_POOL_SOURCE', poolSource: source })

  return (
    <>
      <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
        Author
      </h2>
      <form className="ws-panel ws-inputs" onSubmit={handleSubmit} noValidate>
        <h3 className="ws-panel__heading">Authoring inputs</h3>

        <div className="ws-field">
          <label htmlFor="ws-clue">Clue</label>
          <input
            id="ws-clue"
            type="text"
            ref={clueInputRef}
            value={clue}
            onChange={(event) => dispatch({ type: 'SET_CLUE', clue: event.target.value })}
          />
        </div>

        <fieldset className="ws-field ws-source">
          <legend>Candidate pool</legend>
          <label>
            <input type="radio" name="ws-pool-source" checked={poolSource === 'manual'} onChange={() => selectPoolSource('manual')} />{' '}
            Enter manually
          </label>
          <label>
            <input type="radio" name="ws-pool-source" checked={poolSource === 'sourced'} onChange={() => selectPoolSource('sourced')} />{' '}
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
            <button type="button" className="ws-button ws-button--secondary" onClick={onSource} disabled={sourcing}>
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
            {sourcedPool && (
              <PoolReview
                pool={sourcedPool}
                onToggleIncluded={(id, included) => dispatch({ type: 'SET_CANDIDATE_INCLUDED', id, included })}
              />
            )}
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

        {generationErrors.length > 0 && (
          <div className="ws-errors" role="alert">
            <ul>
              {generationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <GenerateControl type="submit" describedBy={blockingIds} {...generate} />
      </form>
    </>
  )
}
