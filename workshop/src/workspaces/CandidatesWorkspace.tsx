import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { CandidateCard } from '../CandidateCard'
import { CandidateDetail } from '../CandidateDetail'
import { MAX_DISPLAYED_CANDIDATES, WORKSHOP_GENERATION_CONFIG } from '../generateBatch'
import type { WorkshopBatch } from '../generateBatch'
import { WORKSPACE_HASH, candidateKey } from '../shell/useWorkspaceRoute'
import type { CandidateDetailNavigation } from '../shell/useWorkspaceRoute'
import type { FinalPuzzleDraft } from '../state/workshopReducer'
import { CandidateScreen } from './CandidateScreen'
import { GenerateControl } from './GenerateControl'
import type { GenerateProps } from './generateProps'
import { useCandidatesLayout } from './useCandidatesLayout'

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
  /** The key in #/candidates/<key>, if the route names a candidate's detail screen. */
  candidateDetail: string | null
  detailNavigation: CandidateDetailNavigation
}

// The gallery's scroll position, kept in its own history entry (view state,
// never the draft) so returning by Back or All Candidates can restore it.
interface GalleryScrollState {
  wsGalleryScroll: { batchSeed: string; y: number }
}

function savedGalleryScroll(batchSeed: string): number | null {
  const state: unknown = window.history.state
  if (typeof state !== 'object' || state === null || !('wsGalleryScroll' in state)) return null
  const saved = (state as GalleryScrollState).wsGalleryScroll
  return saved.batchSeed === batchSeed ? saved.y : null
}

// Candidates: the current, session-only batch — gallery, inspector, and
// Approve — plus Generate (the same control and handler as Author). Saved
// Candidates is shown as a tab that isn't available yet, never as a
// working one.
//
// Wide workspaces show the gallery beside the inspector. Narrow ones (the
// stylesheet decides; see useCandidatesLayout) show one screen at a time:
// a compact gallery, and a candidate's detail screen at
// #/candidates/<key>. Both read the one selection in the session state: the
// detail route selects its candidate, and a key that names no candidate in
// this batch (a refresh, a replaced batch, a malformed URL) is replaced
// with #/candidates rather than followed.
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
  candidateDetail,
  detailNavigation,
}: CandidatesWorkspaceProps) {
  const viewRef = useRef<HTMLDivElement>(null)
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)
  const layout = useCandidatesLayout(viewRef)
  const candidates = useMemo(() => batch?.candidates ?? [], [batch])
  const keys = useMemo(() => candidates.map((candidate) => candidateKey(candidate.identitySignature)), [candidates])
  // A key must name exactly one candidate in this batch.
  const detailIndex =
    candidateDetail !== null && keys.filter((key) => key === candidateDetail).length === 1
      ? keys.indexOf(candidateDetail)
      : -1
  const detailCandidate = detailIndex >= 0 ? candidates[detailIndex] : null
  const selectedIndex =
    detailIndex >= 0 ? detailIndex : candidates.findIndex((candidate) => candidate.identitySignature === selectedId)
  const selected = selectedIndex >= 0 ? candidates[selectedIndex] : null
  const approvedIndex = candidates.findIndex((candidate) => candidate.identitySignature === approvedId)
  const screen = layout === 'screens' && detailCandidate ? 'detail' : 'gallery'

  // The detail route is what's selected; a key naming nothing is dropped.
  useEffect(() => {
    if (candidateDetail === null) return
    if (!detailCandidate) detailNavigation.discard()
    else if (detailCandidate.identitySignature !== selectedId) onSelect(detailCandidate.identitySignature)
  }, [candidateDetail, detailCandidate, selectedId, onSelect, detailNavigation])

  // Moving between the gallery and the detail screen (not a resize across
  // the breakpoint): the detail screen starts at its top with focus on its
  // heading; the gallery comes back where it was scrolled to, with focus on
  // the card that was open. Before paint, so neither visibly jumps.
  const previousView = useRef({ screen, layout, detailIndex })
  useLayoutEffect(() => {
    const previous = previousView.current
    previousView.current = { screen, layout, detailIndex }
    if (previous.layout !== layout || !batch) return
    if (screen === 'detail' && previous.screen === 'gallery') {
      window.scrollTo(0, 0)
      detailHeadingRef.current?.focus({ preventScroll: true })
    } else if (screen === 'detail' && previous.detailIndex !== detailIndex) {
      // Previous/Next or a swipe: show the new crossword if it's scrolled away.
      if ((viewRef.current?.getBoundingClientRect().top ?? 0) < 0) window.scrollTo(0, 0)
    } else if (screen === 'gallery' && previous.screen === 'detail') {
      const y = savedGalleryScroll(batch.seed)
      if (y !== null) window.scrollTo(0, y)
      const key = selectedIndex >= 0 ? keys[selectedIndex] : null
      const card = key ? viewRef.current?.querySelector<HTMLElement>(`[data-candidate-key="${key}"] button`) : null
      if (card) {
        if (y === null) card.scrollIntoView?.({ block: 'nearest' })
        card.focus({ preventScroll: true })
      }
    }
  }, [screen, layout, detailIndex, batch, keys, selectedIndex])

  function openCandidate(index: number) {
    const candidate = candidates[index]
    onSelect(candidate.identitySignature)
    if (layout === 'screens') {
      const scroll: GalleryScrollState = { wsGalleryScroll: { batchSeed: batch!.seed, y: window.scrollY } }
      window.history.replaceState({ ...window.history.state, ...scroll }, '')
      detailNavigation.open(keys[index])
    } else if (candidateDetail !== null) {
      // Widened while a detail route was open: keep the URL naming the selection.
      detailNavigation.show(keys[index])
    }
  }

  return (
    <div className="ws-candidates-workspace" ref={viewRef}>
      <div className="ws-workspace__header">
        <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
          Candidates
        </h2>
        <GenerateControl type="button" secondary {...generate} />
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
        ) : screen === 'detail' && detailCandidate ? (
          <CandidateScreen
            candidate={detailCandidate}
            index={detailIndex}
            total={candidates.length}
            batchSeed={batch.seed}
            isApproved={detailCandidate.identitySignature === approvedId}
            onApprove={() => onApprove(detailCandidate, detailIndex + 1)}
            approveButtonRef={approveButtonRef}
            headingRef={detailHeadingRef}
            onShow={(index) => {
              onSelect(candidates[index].identitySignature)
              detailNavigation.show(keys[index])
            }}
            onAllCandidates={detailNavigation.close}
          />
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
                <ul className={layout === 'screens' ? 'ws-card-grid ws-card-grid--compact' : 'ws-card-grid'}>
                  {candidates.map((candidate, index) => (
                    <li key={candidate.identitySignature} data-candidate-key={keys[index]}>
                      <CandidateCard
                        candidate={candidate}
                        number={index + 1}
                        isSelected={index === selectedIndex}
                        isApproved={candidate.identitySignature === approvedId}
                        onSelect={() => openCandidate(index)}
                        compact={layout === 'screens'}
                        // Back from Final Puzzle returns focus to the card when there's no inspector.
                        buttonRef={layout === 'screens' && index === selectedIndex ? approveButtonRef : undefined}
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

            {layout === 'columns' && (
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
            )}
          </div>
        )}
      </div>
    </div>
  )
}
