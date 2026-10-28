import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { CandidateBoard } from './CandidateBoard'
import type { FinalPuzzleInputs, FinalPuzzleValidation, MetadataIssue } from './finalPuzzle/finalPuzzle'
import type { PublishedState } from './publishing/contract'
import { WORKSPACE_HASH } from './shell/useWorkspaceRoute'

interface FinalPuzzleProps {
  candidate: PoolCandidate
  number: number
  /** Its name in Saved Candidates ("Candidate 2", or an edited version's name). */
  label?: string
  inputs: FinalPuzzleInputs
  onInputsChange: (inputs: FinalPuzzleInputs) => void
  onBack: () => void
  /** Clears the approval; the candidate stays in Saved Candidates. */
  onClear: () => void
  /** prepareFinalPuzzle's result for this candidate and these inputs (shared with Publish). */
  validation: FinalPuzzleValidation
  /** Set once the server confirms a durable publication; locks the ID and clue. */
  published: PublishedState | null
  /** Context for a Final Puzzle restored from the working draft, such as its publication re-check. */
  notice?: string | null
}

function fieldErrors(issues: MetadataIssue[], field: MetadataIssue['field']): string[] {
  return issues.filter((issue) => issue.field === field).map((issue) => issue.message)
}

// The approved candidate being finalized: the final board (the focus, on
// the left), then author ID + clue and two-layer validation. Publishing and
// the developer export live in the Publish workspace. Read-only geometry for
// now (the word-based editor comes later); a different board means
// approving another candidate. Once published, the ID and clue lock.
export function FinalPuzzle({
  candidate,
  number,
  label = `Candidate ${number}`,
  inputs,
  onInputsChange,
  onBack,
  onClear,
  validation,
  published,
  notice = null,
}: FinalPuzzleProps) {
  const { ready } = validation
  const { construction } = candidate
  const idErrors = fieldErrors(validation.metadataErrors, 'id')
  const clueErrors = fieldErrors(validation.metadataErrors, 'clue')
  const errorCount =
    validation.metadataErrors.length + validation.productionErrors.length + validation.exportErrors.length
  const answers = [...construction.placedAnswers].sort((a, b) => a.word.localeCompare(b.word))

  function update(field: keyof FinalPuzzleInputs, value: string) {
    onInputsChange({ ...inputs, [field]: value })
  }

  const groups = [
    { label: 'Puzzle ID and clue', errors: validation.metadataErrors.map((issue) => issue.message) },
    { label: 'Production validator', errors: validation.productionErrors },
    { label: 'Export requirements', errors: validation.exportErrors },
  ].filter((group) => group.errors.length > 0)

  return (
    <section className="ws-final" aria-labelledby="ws-final-heading">
      <div className="ws-final__header">
        <h2 id="ws-final-heading" className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
          Final Puzzle
          <span className="ws-badge">Approved {label}</span>
        </h2>
        <div className="ws-publish__actions">
          <button type="button" className="ws-button ws-button--secondary" onClick={onBack}>
            Back to Candidate Review
          </button>
          <a className="ws-button ws-button--secondary" href={WORKSPACE_HASH.publish}>
            Go to Publish
          </a>
          <button type="button" className="ws-button ws-button--tertiary" onClick={onClear} aria-describedby="ws-final-clear-hint">
            Clear Final Puzzle
          </button>
        </div>
        <p id="ws-final-clear-hint" className="ws-muted">
          Clearing removes the approval (and this ID and clue); the candidate stays in Saved Candidates. Approving another
          saved candidate replaces this one.
        </p>
        {notice && (
          <p className="ws-final__notice" aria-live="polite">
            {notice}
          </p>
        )}
      </div>

      {/* The board is the focus: first in reading order (so it stacks first),
          beside the details on wider workspaces. */}
      <div className="ws-final__body">
        <div className="ws-final__board">
          <CandidateBoard
            construction={construction}
            label={`Final puzzle board, ${construction.width} by ${construction.height} grid.`}
          />
        </div>

        <div className="ws-final__details">
          <div className="ws-field">
            <label htmlFor="ws-final-id">Puzzle ID</label>
            <input
              id="ws-final-id"
              type="text"
              value={inputs.id}
              onChange={(event) => update('id', event.target.value)}
              readOnly={published !== null}
              aria-invalid={idErrors.length > 0}
              aria-describedby={['ws-final-id-hint', idErrors.length > 0 && 'ws-final-id-error', published && 'ws-final-locked']
                .filter(Boolean)
                .join(' ')}
              spellCheck={false}
              autoComplete="off"
            />
            <p id="ws-final-id-hint" className="ws-muted">
              Lowercase letters and digits, starting with a letter. The ID is permanent: players’ saved results
              are keyed by it, and it names the exported files.
            </p>
            {idErrors.length > 0 && (
              <p id="ws-final-id-error" className="ws-field__error">
                {idErrors.join(' ')}
              </p>
            )}
          </div>

          <div className="ws-field">
            <label htmlFor="ws-final-clue">Clue</label>
            <input
              id="ws-final-clue"
              type="text"
              value={inputs.clue}
              onChange={(event) => update('clue', event.target.value)}
              readOnly={published !== null}
              aria-invalid={clueErrors.length > 0}
              aria-describedby={
                [clueErrors.length > 0 && 'ws-final-clue-error', published && 'ws-final-locked'].filter(Boolean).join(' ') ||
                undefined
              }
            />
            {clueErrors.length > 0 && (
              <p id="ws-final-clue-error" className="ws-field__error">
                {clueErrors.join(' ')}
              </p>
            )}
          </div>

          {published && (
            <p id="ws-final-locked" className="ws-muted">
              Published: the ID and clue are locked.
            </p>
          )}

          <h3 className="ws-detail__subheading">Validation</h3>
          <div role="status" className="ws-final__status">
            {ready ? (
              <p className="ws-final__status-ok">
                <strong>Ready to export.</strong> Passes the production validator and the Workshop export
                requirements.
              </p>
            ) : (
              <div className="ws-errors">
                <strong>
                  Validation errors ({errorCount}). Export is disabled until they are fixed.
                </strong>
                {groups.map((group) => (
                  <div key={group.label} className="ws-final__error-group">
                    <p>{group.label}</p>
                    <ul>
                      {group.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <dl className="ws-detail__summary">
            <div>
              <dt>Size</dt>
              <dd>
                {construction.width} × {construction.height}
              </dd>
            </div>
            <div>
              <dt>Cells</dt>
              <dd>{Object.keys(construction.cells).length}</dd>
            </div>
          </dl>
          <h3 className="ws-detail__subheading">Answers ({answers.length})</h3>
          <ul className="ws-word-list" aria-label="Answers">
            {answers.map((answer) => (
              <li key={`${answer.word}-${answer.direction}`}>
                {answer.word} <span className="ws-muted-inline">{answer.direction}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
