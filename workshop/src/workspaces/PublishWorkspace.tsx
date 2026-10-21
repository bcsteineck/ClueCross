import { layoutModuleFile, puzzleModuleFile } from '../finalPuzzle/exportSource'
import type { ExportFile } from '../finalPuzzle/exportSource'
import type { FinalPuzzleValidation } from '../finalPuzzle/finalPuzzle'
import type { ProductionClient } from '../production/productionClient'
import { ProductionPublishSection } from '../ProductionPublishSection'
import type { PublishedState } from '../publishing/contract'
import type { PublishingClient } from '../publishing/publishingClient'
import { PublishSection } from '../PublishSection'
import { WORKSPACE_HASH } from '../shell/useWorkspaceRoute'
import type { FinalPuzzleDraft } from '../state/workshopReducer'

interface PublishWorkspaceProps {
  finalPuzzle: FinalPuzzleDraft | null
  /** prepareFinalPuzzle's result for the Final Puzzle (null without one). */
  validation: FinalPuzzleValidation | null
  publisher: PublishingClient
  /** Present only in Production-operations mode. */
  production: ProductionClient | null
  published: PublishedState | null
  onPublished: (state: PublishedState) => void
  notice: string | null
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

// Publish: the dev calendar, Production (in Production-operations mode
// only), and the developer export under Advanced. Every action is the same
// component with the same request as before; this workspace only arranges
// them. Publishing is offered only for a valid Final Puzzle — reaching
// #/publish directly changes nothing about that.
export function PublishWorkspace({ finalPuzzle, validation, publisher, production, published, onPublished, notice }: PublishWorkspaceProps) {
  const heading = (
    <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
      Publish
    </h2>
  )

  if (!finalPuzzle || !validation) {
    return (
      <section className="ws-panel ws-workspace" aria-label="Publish">
        {heading}
        <div className="ws-empty">
          <p>
            <strong>Nothing to publish yet.</strong> Publishing needs an approved Final Puzzle.
          </p>
          <p className="ws-muted">Generate candidates, approve one, and check its ID and clue in Final Puzzle.</p>
          <div className="ws-publish__actions">
            <a className="ws-button ws-button--secondary" href={WORKSPACE_HASH.candidates}>
              Go to Candidates
            </a>
            <a className="ws-button ws-button--secondary" href={WORKSPACE_HASH.author}>
              Go to Author
            </a>
          </div>
        </div>
      </section>
    )
  }

  const { construction } = finalPuzzle.candidate
  const { inputs } = finalPuzzle
  const { puzzle, layout, ready } = validation
  const files = ready && puzzle && layout ? [puzzleModuleFile(puzzle, layout), layoutModuleFile(layout)] : []
  const errorCount = validation.metadataErrors.length + validation.productionErrors.length + validation.exportErrors.length
  const request = { construction, id: inputs.id, clue: inputs.clue }

  return (
    <section className="ws-panel ws-workspace ws-publish-workspace" aria-label="Publish">
      {heading}

      <div className="ws-publish-workspace__summary">
        <p>
          Approved Candidate {finalPuzzle.number}
          {inputs.id.trim() && ` · ${inputs.id.trim()}`}
          {inputs.clue.trim() && ` · “${inputs.clue.trim()}”`}
          {published && ' · Published: the ID and clue are locked.'}
        </p>
        {ready ? (
          <p className="ws-final__status-ok">
            <strong>Ready to publish.</strong> Passes the production validator and the Workshop export requirements.
          </p>
        ) : (
          <p className="ws-errors">
            <strong>Not ready to publish.</strong> {errorCount} validation {errorCount === 1 ? 'error' : 'errors'} in the
            Final Puzzle. <a href={WORKSPACE_HASH.final}>Fix them in Final Puzzle</a>.
          </p>
        )}
        {notice && <p className="ws-final__notice">{notice}</p>}
      </div>

      {ready && (
        <>
          <h3 className="ws-detail__subheading">Publish to dev calendar (testing)</h3>
          <p className="ws-muted">Publishes to this Workshop’s dev database for testing. It never reaches players.</p>
          <PublishSection request={request} publisher={publisher} published={published} onPublished={onPublished} />
          {production && (
            <>
              <h3 className="ws-detail__subheading">Publish to Production</h3>
              <ProductionPublishSection request={request} client={production} />
            </>
          )}
        </>
      )}

      <details className="ws-advanced">
        <summary>Advanced: developer export (download puzzle modules)</summary>
        <h3 className="ws-detail__subheading">Developer export</h3>
        <p className="ws-muted">
          For inspection, debugging, test fixtures, or emergency manual work only. Publishing is how a puzzle reaches
          players: the server assigns its permanent date and the player loads it from the puzzle API at release — no
          code change or redeploy.
        </p>
        {ready ? (
          <>
            <ul className="ws-final__downloads">
              {files.map((file) => (
                <li key={file.path}>
                  <button type="button" className="ws-button" onClick={() => downloadFile(file)}>
                    Download {file.filename}
                  </button>
                </li>
              ))}
            </ul>
            {files.map((file) => (
              <details key={file.path} className="ws-final__source">
                <summary>Preview {file.filename}</summary>
                <pre>{file.source}</pre>
              </details>
            ))}
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
              Fix the validation errors in Final Puzzle to export.
            </p>
          </>
        )}
      </details>
    </section>
  )
}
