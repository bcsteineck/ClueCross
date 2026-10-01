import { useEffect, useMemo, useRef, useState } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { CandidateBoard } from './CandidateBoard'
import { layoutModuleFile, puzzleModuleFile, registrySnippet } from './finalPuzzle/exportSource'
import type { ExportFile } from './finalPuzzle/exportSource'
import { prepareFinalPuzzle } from './finalPuzzle/finalPuzzle'
import type { FinalPuzzleInputs, MetadataIssue } from './finalPuzzle/finalPuzzle'
import type { PublishingClient } from './publishing/publishingClient'
import { PublishSection } from './PublishSection'
import type { PublishedState } from './PublishSection'

interface FinalPuzzleProps {
  candidate: PoolCandidate
  number: number
  inputs: FinalPuzzleInputs
  onInputsChange: (inputs: FinalPuzzleInputs) => void
  onBack: () => void
  publisher: PublishingClient
  /** Set once the server confirms a durable publication; locks the ID and clue. */
  published: PublishedState | null
  onPublished: (state: PublishedState) => void
}

// Browser download of one generated module; nothing is written anywhere else.
function downloadFile(file: ExportFile) {
  const url = URL.createObjectURL(new Blob([file.source], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function fieldErrors(issues: MetadataIssue[], field: MetadataIssue['field']): string[] {
  return issues.filter((issue) => issue.field === field).map((issue) => issue.message)
}

// The approved candidate being prepared for publishing: author id + clue,
// the final board, two-layer validation, Publish, and the developer export
// fallback. Read-only geometry — v1 is not an editor; a different board
// means returning to Candidate Review. Once published, the ID and clue lock.
export function FinalPuzzle({
  candidate,
  number,
  inputs,
  onInputsChange,
  onBack,
  publisher,
  published,
  onPublished,
}: FinalPuzzleProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const validation = useMemo(() => prepareFinalPuzzle(candidate.construction, inputs), [candidate, inputs])
  const { puzzle, layout, ready } = validation
  const files = ready && puzzle && layout ? [puzzleModuleFile(puzzle, layout), layoutModuleFile(layout)] : []
  const snippet = ready && puzzle ? registrySnippet(puzzle.id) : ''
  const { construction } = candidate
  const idErrors = fieldErrors(validation.metadataErrors, 'id')
  const clueErrors = fieldErrors(validation.metadataErrors, 'clue')
  const errorCount =
    validation.metadataErrors.length + validation.productionErrors.length + validation.exportErrors.length
  const answers = [...construction.placedAnswers].sort((a, b) => a.word.localeCompare(b.word))

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  function update(field: keyof FinalPuzzleInputs, value: string) {
    setCopyStatus('')
    onInputsChange({ ...inputs, [field]: value })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopyStatus('Registry snippet copied.')
    } catch {
      setCopyStatus('Copy failed. Select the snippet text and copy it manually.')
    }
  }

  const groups = [
    { label: 'Puzzle ID and clue', errors: validation.metadataErrors.map((issue) => issue.message) },
    { label: 'Production validator', errors: validation.productionErrors },
    { label: 'Export requirements', errors: validation.exportErrors },
  ].filter((group) => group.errors.length > 0)

  return (
    <section className="ws-panel ws-final" aria-labelledby="ws-final-heading">
      <div className="ws-final__header">
        <h2 id="ws-final-heading" className="ws-panel__heading" ref={headingRef} tabIndex={-1}>
          Final Puzzle
          <span className="ws-badge">Approved Candidate {number}</span>
        </h2>
        <p className="ws-muted">
          Preparing the approved candidate for publishing. Nothing is published until you confirm Publish, and the
          Workshop never changes production files.
        </p>
        <button type="button" className="ws-button ws-button--secondary" onClick={onBack}>
          Back to Candidate Review
        </button>
      </div>

      <div className="ws-final__body">
        <div className="ws-final__main">
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

          {ready && (
            <>
              <h3 className="ws-detail__subheading">Publish</h3>
              <PublishSection
                request={{ construction, id: inputs.id, clue: inputs.clue }}
                publisher={publisher}
                published={published}
                onPublished={onPublished}
              />
            </>
          )}

          <h3 className="ws-detail__subheading">Developer export</h3>
          <p className="ws-muted">
            Fallback developer workflow. Download the production puzzle modules for manual integration if the
            publishing system is unavailable or manual integration is needed.
          </p>
          {ready ? (
            <>
              <ul className="ws-final__downloads">
                {files.map((file) => (
                  <li key={file.path}>
                    <button type="button" className="ws-button" onClick={() => downloadFile(file)}>
                      Download {file.filename}
                    </button>
                    <span className="ws-muted">Save as {file.path}</span>
                  </li>
                ))}
              </ul>
              {files.map((file) => (
                <details key={file.path} className="ws-final__source">
                  <summary>Preview {file.filename}</summary>
                  <pre>{file.source}</pre>
                </details>
              ))}

              <h3 className="ws-detail__subheading">Registry snippet</h3>
              <p className="ws-muted">
                Developer integration reference only. Publishing and calendar scheduling will be handled by a
                separate workflow.
              </p>
              <pre className="ws-final__snippet" aria-label="Registry snippet">
                {snippet}
              </pre>
              <button type="button" className="ws-button ws-button--secondary" onClick={() => void handleCopy()}>
                Copy Registry Snippet
              </button>
              <p className="ws-muted" role="status">
                {copyStatus}
              </p>

              <h3 className="ws-detail__subheading">Manual developer integration</h3>
              <ol className="ws-final__steps">
                <li>Save the two downloaded modules at the paths shown above.</li>
                <li>Add the ID to PUZZLE_IDS in src/data/puzzleIds.ts.</li>
                <li>Add the imports and PUZZLES entry to src/data/archivePuzzles.ts.</li>
                <li>Add the new puzzle to src/core/validatePuzzleDefinition.test.ts.</li>
                <li>Run typecheck, tests, lint, and the production build.</li>
                <li>Commit the integration changes.</li>
              </ol>
              <p className="ws-muted">
                Publishing and scheduling are intentionally not included here. A separate publishing workflow will
                assign approved puzzles to calendar dates without shifting previously published puzzles.
              </p>
            </>
          ) : (
            <>
              {/* aria-disabled keeps the controls focusable and explained, matching Generate. */}
              <ul className="ws-final__downloads">
                <li>
                  <button type="button" className="ws-button" aria-disabled="true" aria-describedby="ws-final-export-blocked">
                    Download Puzzle Modules
                  </button>
                </li>
              </ul>
              <p id="ws-final-export-blocked" className="ws-muted">
                Fix the validation errors above to export.
              </p>
            </>
          )}
        </div>

        <div className="ws-final__preview">
          <div className="ws-detail__board">
            <CandidateBoard
              construction={construction}
              label={`Final puzzle board, ${construction.width} by ${construction.height} grid.`}
            />
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
