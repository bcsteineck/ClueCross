import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CandidateCard } from './CandidateCard'
import { CandidateDetail } from './CandidateDetail'
import { MAX_DISPLAYED_CANDIDATES, WORKSHOP_GENERATION_CONFIG, generateBatch } from './generateBatch'
import type { WorkshopBatch } from './generateBatch'
import { parsePool } from './parsePool'
import { MIN_USABLE_ANSWERS, RECOMMENDED_POOL_SIZE, buildPoolSummary } from './poolDiagnostics'
import type { DiagnosticSeverity } from './poolDiagnostics'

// Pool summary, then errors, warnings and info, then Generate. Severity is
// spelled out in text so it never relies on color alone.
const SEVERITY_ORDER: DiagnosticSeverity[] = ['error', 'warning', 'info']
const SEVERITY_LABEL: Record<DiagnosticSeverity, string> = { error: 'Error', warning: 'Warning', info: 'Note' }

// Session-only authoring loop: clue + word pool -> candidate batch ->
// select -> approve. Nothing here persists, publishes, or writes files;
// selection and approval live only in this component's state, and a new
// batch clears both so approval never appears to outlive what it
// approved.
export function WorkshopApp() {
  const [clue, setClue] = useState('')
  const [poolText, setPoolText] = useState('')
  // Counts successful generations this session; batch N uses seed
  // "workshop-generation-N", so each press yields a new but reproducible batch.
  const [generationCount, setGenerationCount] = useState(0)
  const [batch, setBatch] = useState<WorkshopBatch | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [approvedId, setApprovedId] = useState<string | null>(null)

  const pool = useMemo(() => parsePool(poolText), [poolText])
  const summary = buildPoolSummary(pool.stats)
  const blockingIds = pool.diagnostics
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => `ws-diagnostic-${diagnostic.code}`)
    .join(' ')

  function handleGenerate(event: FormEvent) {
    event.preventDefault()
    const next = generationCount + 1
    const result = generateBatch(clue, pool, next)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors([])
    setGenerationCount(next)
    setBatch(result.batch)
    setSelectedId(null)
    setApprovedId(null)
  }

  const candidates = batch?.candidates ?? []
  const selectedIndex = candidates.findIndex((candidate) => candidate.identitySignature === selectedId)
  const selected = selectedIndex >= 0 ? candidates[selectedIndex] : null
  const approvedIndex = candidates.findIndex((candidate) => candidate.identitySignature === approvedId)

  return (
    <div className="ws-app">
      <header className="ws-header">
        <h1>ClueCross Workshop</h1>
        <p className="ws-muted">Internal authoring tool. Not part of the ClueCross game.</p>
      </header>

      <form className="ws-panel ws-inputs" onSubmit={handleGenerate} noValidate>
        <h2 className="ws-panel__heading">Authoring inputs</h2>

        <div className="ws-field">
          <label htmlFor="ws-clue">Clue</label>
          <input id="ws-clue" type="text" value={clue} onChange={(event) => setClue(event.target.value)} />
        </div>

        <div className="ws-field">
          <label htmlFor="ws-pool">Candidate words</label>
          <textarea
            id="ws-pool"
            rows={10}
            value={poolText}
            onChange={(event) => setPoolText(event.target.value)}
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
            <li>Separate words with new lines or commas.</li>
          </ul>
          <div id="ws-pool-summary" className="ws-pool-summary">
            <p className="ws-pool-summary__headline">{summary.headline}</p>
            <ul className="ws-pool-summary__bands">
              <li>{summary.short}</li>
              <li>{summary.medium}</li>
              <li>{summary.long}</li>
              <li>{summary.average}</li>
            </ul>
          </div>
        </div>

        {SEVERITY_ORDER.map((severity) => {
          const diagnostics = pool.diagnostics.filter((diagnostic) => diagnostic.severity === severity)
          if (diagnostics.length === 0) return null
          return (
            <ul key={severity} className={`ws-diagnostics ws-diagnostics--${severity}`}>
              {diagnostics.map((diagnostic) => (
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
          aria-disabled={!pool.canGenerate}
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
                      onSelect={() => setSelectedId(candidate.identitySignature)}
                    />
                  </li>
                ))}
              </ul>
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
                onApprove={() => setApprovedId(selected.identitySignature)}
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
