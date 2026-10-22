import type { Ref } from 'react'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { CandidateDetail } from '../CandidateDetail'
import { useSwipeNavigation } from './useSwipeNavigation'

interface CandidateScreenProps {
  candidate: PoolCandidate
  /** Zero-based position in the current batch. */
  index: number
  total: number
  batchSeed: string
  isApproved: boolean
  onApprove: () => void
  approveButtonRef: Ref<HTMLButtonElement>
  headingRef: Ref<HTMLHeadingElement>
  /** Moves to the candidate at this position (always within the batch). */
  onShow: (index: number) => void
  onAllCandidates: () => void
}

// The narrow-workspace detail screen: it replaces the gallery (it isn't an
// overlay), and is the same inspector as beside the gallery, plus a way
// back, the candidate's position, and Previous/Next (also by swiping the
// board). Boundary buttons stay focusable with aria-disabled, so pressing
// Next onto the last candidate doesn't drop keyboard focus; they never wrap.
export function CandidateScreen({
  candidate,
  index,
  total,
  batchSeed,
  isApproved,
  onApprove,
  approveButtonRef,
  headingRef,
  onShow,
  onAllCandidates,
}: CandidateScreenProps) {
  const number = index + 1
  const hasPrevious = index > 0
  const hasNext = index < total - 1
  const showPrevious = () => hasPrevious && onShow(index - 1)
  const showNext = () => hasNext && onShow(index + 1)
  const swipe = useSwipeNavigation((direction) => (direction === 'next' ? showNext() : showPrevious()))

  return (
    <div className="ws-candidate-screen">
      <button type="button" className="ws-button ws-button--secondary ws-candidate-screen__back" onClick={onAllCandidates}>
        <span aria-hidden="true">‹ </span>All Candidates
      </button>
      <CandidateDetail
        candidate={candidate}
        number={number}
        batchSeed={batchSeed}
        isApproved={isApproved}
        onApprove={onApprove}
        approveButtonRef={approveButtonRef}
        heading={
          <>
            Candidate {number} <span className="ws-detail__position">of {total}</span>
          </>
        }
        headingRef={headingRef}
        navigation={
          <div className="ws-candidate-nav" role="group" aria-label="Move between candidates">
            <button
              type="button"
              className="ws-button ws-button--secondary"
              aria-disabled={!hasPrevious}
              onClick={showPrevious}
            >
              <span aria-hidden="true">‹ </span>Previous
            </button>
            <button type="button" className="ws-button ws-button--secondary" aria-disabled={!hasNext} onClick={showNext}>
              Next<span aria-hidden="true"> ›</span>
            </button>
            {/* Previous/Next keep focus on the button, so the new candidate is announced here. */}
            <p className="ws-visually-hidden" role="status">
              Candidate {number} of {total}
            </p>
          </div>
        }
        swipe={swipe}
      />
    </div>
  )
}
