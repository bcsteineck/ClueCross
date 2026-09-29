import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CandidateCard } from './CandidateCard'
import { CandidateDetail } from './CandidateDetail'
import { MAX_DISPLAYED_CANDIDATES, WORKSHOP_GENERATION_CONFIG, generateBatch } from './generateBatch'
import type { WorkshopBatch } from './generateBatch'
import { parsePool } from './parsePool'

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
            aria-describedby="ws-pool-guidance ws-pool-count"
            placeholder={'BEAGLE\nPOODLE\nCOLLIE\n…'}
            spellCheck={false}
          />
          <ul id="ws-pool-guidance" className="ws-guidance">
            <li>
              {WORKSHOP_GENERATION_CONFIG.minAnswers}–{WORKSHOP_GENERATION_CONFIG.maxAnswers} answers will be
              selected for a generated puzzle (never more than the number of candidate words).
            </li>
            <li>Pools of mostly long words may produce few or no candidates.</li>
            <li>For useful variety, provide more than {WORKSHOP_GENERATION_CONFIG.maxAnswers} candidate words.</li>
            <li>All candidate words should already be considered valid answers to the clue.</li>
            <li>Separate words with new lines or commas.</li>
          </ul>
          <p id="ws-pool-count" className="ws-pool-count">
            {pool.words.length} candidate {pool.words.length === 1 ? 'word' : 'words'}
          </p>
        </div>

        {(pool.invalid.length > 0 || pool.duplicates.length > 0) && (
          <div className="ws-issues">
            {pool.invalid.length > 0 && (
              <>
                <h3>Invalid words</h3>
                <ul>
                  {pool.invalid.map((item, index) => (
                    <li key={`${item.raw}-${index}`}>{item.reason}</li>
                  ))}
                </ul>
              </>
            )}
            {pool.duplicates.length > 0 && (
              <>
                <h3>Duplicate words</h3>
                <ul>
                  {pool.duplicates.map((item) => (
                    <li key={item.word}>
                      {item.word} appears {item.count} times
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {errors.length > 0 && (
          <div className="ws-errors" role="alert">
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <button type="submit" className="ws-button">
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
