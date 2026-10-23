import type { Ref } from 'react'
import { formatPublishDate } from './publishing/formatPublication'
import type { SavedPublication } from './state/workshopReducer'

/** A candidate's place in the workflow, as shown on its card and in its detail. */
export type CandidateStatus = 'unsaved' | 'saving' | 'saved' | 'removing' | 'approved'

interface BatchCandidateActionsProps {
  status: CandidateStatus
  /** Why the last save of this candidate didn't happen, if it failed. */
  error: string | null
  onSave: () => void
}

const BATCH_LABEL: Record<CandidateStatus, string> = {
  unsaved: 'Save Candidate',
  saving: 'Saving…',
  saved: 'Saved',
  removing: 'Saved',
  approved: 'Approved',
}

// Current Batch: Save is the only action (approval happens in Saved
// Candidates). One button carries all three states — Save Candidate,
// Saving…, Saved — so focus stays put while the save completes; once saving
// starts it is aria-disabled, never a second Save. "Saved" appears only
// after the working draft is written.
export function BatchCandidateActions({ status, error, onSave }: BatchCandidateActionsProps) {
  const available = status === 'unsaved'
  return (
    <div className="ws-detail__approve">
      <button
        type="button"
        className={available ? 'ws-button' : 'ws-button ws-button--secondary'}
        aria-disabled={!available}
        onClick={() => available && onSave()}
      >
        {(status === 'saved' || status === 'approved') && <span aria-hidden="true">✓ </span>}
        {BATCH_LABEL[status]}
      </button>
      {error && (
        <p className="ws-errors" role="alert">
          {error}
        </p>
      )}
      <p className="ws-muted">
        {status === 'approved'
          ? 'This layout is the approved Final Puzzle, and is kept in Saved Candidates.'
          : 'Saving keeps this layout in Saved Candidates (part of the working draft), where you can approve it as the Final Puzzle. Unsaved candidates are lost when you generate again or refresh.'}
      </p>
    </div>
  )
}

interface SavedCandidateActionsProps {
  status: CandidateStatus
  error: string | null
  /** The Author clue the Final Puzzle will use. */
  currentClue: string
  /** Its dev-calendar publication, if it was published while it was the Final Puzzle. */
  publication: SavedPublication | null
  onApprove: () => void
  onOpenFinal: () => void
  onRemove: () => void
  /** Approve (or Open Final Puzzle): focus returns here from the Final Puzzle. */
  approveButtonRef?: Ref<HTMLButtonElement>
}

// Saved Candidates: Approve as Final Puzzle and Remove from Saved, or, for
// the approved candidate, Open Final Puzzle and no Remove (approve another
// or clear the Final Puzzle first). While a removal is being saved both are
// aria-disabled, so nothing can act on a candidate mid-write.
export function SavedCandidateActions({
  status,
  error,
  currentClue,
  publication,
  onApprove,
  onOpenFinal,
  onRemove,
  approveButtonRef,
}: SavedCandidateActionsProps) {
  const removing = status === 'removing'
  const clue = currentClue.trim()
  if (status === 'approved') {
    return (
      <div className="ws-detail__approve">
        <button type="button" className="ws-button" onClick={onOpenFinal} ref={approveButtonRef}>
          Open Final Puzzle
        </button>
        <p className="ws-muted">
          This is the approved Final Puzzle. To remove it from Saved Candidates, approve another candidate or clear the
          Final Puzzle first.
        </p>
      </div>
    )
  }
  return (
    <div className="ws-detail__approve">
      <div className="ws-detail__actions">
        <button
          type="button"
          className="ws-button"
          aria-disabled={removing}
          onClick={() => !removing && onApprove()}
          ref={approveButtonRef}
        >
          Approve as Final Puzzle
        </button>
        <button
          type="button"
          className="ws-button ws-button--secondary"
          aria-disabled={removing}
          onClick={() => !removing && onRemove()}
        >
          {removing ? 'Removing…' : 'Remove from Saved'}
        </button>
      </div>
      {error && (
        <p className="ws-errors" role="alert">
          {error}
        </p>
      )}
      {publication ? (
        <p className="ws-muted">
          Published to the dev calendar as “{publication.published.publication.puzzleId}”, scheduled for{' '}
          {formatPublishDate(publication.published.publication.publishDate)}. Approving makes this the Final Puzzle
          again with the ID and clue it was published with. Removing it from Saved Candidates doesn’t unpublish it.
        </p>
      ) : (
        <p className="ws-muted">
          Approving makes this the Final Puzzle with the current Author clue
          {clue ? ` (“${clue}”)` : ''}. It stays in Saved Candidates; nothing is published.
        </p>
      )}
    </div>
  )
}
