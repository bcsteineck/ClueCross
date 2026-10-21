import type { RefObject } from 'react'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { CandidateCard } from '../CandidateCard'
import { CandidateDetail } from '../CandidateDetail'
import { MAX_DISPLAYED_CANDIDATES, WORKSHOP_GENERATION_CONFIG } from '../generateBatch'
import type { WorkshopBatch } from '../generateBatch'
import { WORKSPACE_HASH } from '../shell/useWorkspaceRoute'
import type { FinalPuzzleDraft } from '../state/workshopReducer'
import { GenerateControl } from './GenerateControl'
import type { GenerateProps } from './generateProps'

interface CandidatesWorkspaceProps {
  batch: WorkshopBatch | null
  selectedId: string | null
  approvedId: string | null
  finalPuzzle: FinalPuzzleDraft | null
  /** Errors from the last refused Generate (the inputs to fix are in Author). */
  generationErrors: string[]
  onSelect: (id: string) => void
  onApprove: (candidate: PoolCandidate, number: number) => void
  /** Opens the current Final Puzzle (one that isn't in this batch, e.g. restored). */
  onOpenFinal: () => void
  /** The control that approved (or reopens) the Final Puzzle; focus returns here from it. */
  approveButtonRef: RefObject<HTMLButtonElement | null>
  generate: GenerateProps
}

// Candidates: the current, session-only batch — gallery, inspector, and
// Approve — plus Generate (the same control and handler as Author). Saved
// Candidates is shown as a tab that isn't available yet, never as a
// working one.
export function CandidatesWorkspace({
  batch,
  selectedId,
  approvedId,
  finalPuzzle,
  generationErrors,
  onSelect,
  onApprove,
  onOpenFinal,
  approveButtonRef,
  generate,
}: CandidatesWorkspaceProps) {
  const candidates = batch?.candidates ?? []
  const selectedIndex = candidates.findIndex((candidate) => candidate.identitySignature === selectedId)
  const selected = selectedIndex >= 0 ? candidates[selectedIndex] : null
  const approvedIndex = candidates.findIndex((candidate) => candidate.identitySignature === approvedId)

  return (
    <>
      <div className="ws-workspace__header">
        <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
          Candidates
        </h2>
        <GenerateControl type="button" {...generate} />
      </div>

      {generationErrors.length > 0 && (
        <div className="ws-errors" role="alert">
          <ul>
            {generationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <p>
            Your authoring inputs are unchanged. <a href={WORKSPACE_HASH.author}>Review them in Author</a>.
          </p>
        </div>
      )}

      <div className="ws-tabs-group">
      <div className="ws-tabs" role="tablist" aria-label="Candidate lists">
        <button type="button" role="tab" id="ws-tab-current" className="ws-tabs__tab" aria-selected="true" aria-controls="ws-tabpanel-current">
          Current Batch
        </button>
        <button
          type="button"
          role="tab"
          id="ws-tab-saved"
          className="ws-tabs__tab"
          aria-selected="false"
          aria-disabled="true"
          aria-describedby="ws-tab-saved-note"
          tabIndex={-1}
        >
          Saved Candidates <span className="ws-tabs__soon">(coming soon)</span>
        </button>
      </div>
      <p id="ws-tab-saved-note" className="ws-muted">
        Saving candidates across batches isn’t available yet. For now, the current batch lasts only for this browser
        session.
      </p>
      </div>

      <div role="tabpanel" id="ws-tabpanel-current" aria-labelledby="ws-tab-current" className="ws-tabpanel">
        {!batch ? (
          <div className="ws-panel ws-empty">
            <p>
              <strong>No current batch.</strong> Generated candidates are kept only until you close or refresh the
              Workshop. Generate a new batch here, or adjust the inputs in <a href={WORKSPACE_HASH.author}>Author</a>.
            </p>
            {finalPuzzle && (
              <div className="ws-restored-final">
                <p>
                  Approved Candidate {finalPuzzle.number}
                  {finalPuzzle.inputs.id.trim() && ` · ${finalPuzzle.inputs.id.trim()}`}
                  {finalPuzzle.inputs.clue.trim() && ` · “${finalPuzzle.inputs.clue.trim()}”`} is saved in the working draft
                  as the Final Puzzle, even though its original batch isn’t kept.
                </p>
                <button type="button" className="ws-button" ref={approveButtonRef} onClick={onOpenFinal}>
                  Open Final Puzzle
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="ws-results">
            <section className="ws-panel ws-candidates" aria-labelledby="ws-candidates-heading">
              <h3 id="ws-candidates-heading" className="ws-panel__heading">
                Generated Candidates ({candidates.length})
              </h3>
              <p className="ws-meta" role="status">
                Clue “{batch.clue}” · {batch.pool.length} words · seed {batch.seed} ·{' '}
                {batch.diversity.subsetTrialsAttempted} trials, {batch.diversity.uniqueCandidateCount} unique
                {batch.diversity.uniqueCandidateCount > MAX_DISPLAYED_CANDIDATES && ` (showing first ${MAX_DISPLAYED_CANDIDATES})`}{' '}
                · {Math.round(batch.elapsedMs)} ms
                {batch.priorityWords.length > 0 && ` · Priority Words: ${batch.priorityWords.join(', ')}`}
                {approvedIndex >= 0 && ` · Candidate ${approvedIndex + 1} approved`}
              </p>
              <p className="ws-muted ws-candidates__note">
                Generated candidates are temporary until approved as the Final Puzzle. Unsaved candidates will be lost when
                you close or refresh the Workshop.
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
                        onSelect={() => onSelect(candidate.identitySignature)}
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
                  onApprove={() => onApprove(selected, selectedIndex + 1)}
                  approveButtonRef={approveButtonRef}
                />
              ) : (
                <p className="ws-muted">Select a candidate to inspect it.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
