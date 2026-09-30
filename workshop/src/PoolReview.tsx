import type { SourcedPool } from './sourcing/sourceCandidates'
import { isIncludable } from './sourcing/reviewPool'
import type { CandidateFlag, ReviewCandidate } from './sourcing/reviewPool'

interface PoolReviewProps {
  pool: SourcedPool
  onToggleIncluded: (id: string, included: boolean) => void
}

function flagText(flag: CandidateFlag, answerOf: (id: string) => string): string | null {
  switch (flag.type) {
    case 'singular-plural-conflict':
      return `Possible singular/plural of ${flag.relatedCandidateIds.map(answerOf).join(', ')}`
    case 'possible-morphological-variant':
      return `Possible variant of ${flag.relatedCandidateIds.map(answerOf).join(', ')}`
    default:
      // Future flag types have no deterministic detector yet.
      return null
  }
}

function reviewNotes(candidate: ReviewCandidate, answerOf: (id: string) => string): string[] {
  if (candidate.validity === 'invalid') return [`Invalid: ${candidate.invalidReason}`]
  if (candidate.duplicateOf) return [`Duplicate of ${answerOf(candidate.duplicateOf)}`]
  return candidate.flags.map((flag) => flagText(flag, answerOf)).filter((text): text is string => text !== null)
}

// Human Pool Review: the author sees each sourced candidate with its
// rationale, category, construction form and any mechanical notes, and
// decides what's included. Flags inform; they never exclude.
export function PoolReview({ pool, onToggleIncluded }: PoolReviewProps) {
  const { candidates, issues } = pool
  const answerOf = (id: string) => candidates.find((c) => c.id === id)?.sourceAnswer ?? id
  const included = candidates.filter((c) => isIncludable(c) && c.included).length
  const duplicates = candidates.filter((c) => c.duplicateOf !== undefined).length
  const invalid = candidates.filter((c) => c.validity === 'invalid').length
  const flagged = candidates.filter((c) => isIncludable(c) && c.flags.length > 0).length

  return (
    <section className="ws-review" aria-labelledby="ws-review-heading">
      <h3 id="ws-review-heading">Pool Review</h3>
      <p className="ws-muted">
        Sourced for “{pool.request.clue}” · {candidates.length} candidates · {included} included · {flagged} flagged ·{' '}
        {duplicates} duplicate · {invalid} invalid
        {issues.length > 0 && ` · ${issues.length} malformed`}
      </p>
      {issues.length > 0 && (
        <ul className="ws-diagnostics ws-diagnostics--info">
          {issues.map((issue) => (
            <li key={issue.index}>
              <strong>Sourcing issue:</strong> {issue.reason} Not added to the pool.
            </li>
          ))}
        </ul>
      )}
      <div className="ws-review__scroll">
        <table className="ws-review__table">
          <thead>
            <tr>
              <th scope="col">Include</th>
              <th scope="col">Answer</th>
              <th scope="col">Category</th>
              <th scope="col">Rationale</th>
              <th scope="col">Review</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => {
              const notes = reviewNotes(candidate, answerOf)
              return (
                <tr key={candidate.id} className={candidate.included ? undefined : 'ws-review__row--out'}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Include ${candidate.sourceAnswer}`}
                      checked={candidate.included}
                      disabled={!isIncludable(candidate)}
                      onChange={(event) => onToggleIncluded(candidate.id, event.target.checked)}
                    />
                  </td>
                  <td>
                    {candidate.sourceAnswer}
                    {/* Construction form only when normalization changed more than case. */}
                    {candidate.normalizedAnswer && candidate.normalizedAnswer !== candidate.sourceAnswer.toUpperCase() && (
                      <span className="ws-review__construction"> {candidate.normalizedAnswer}</span>
                    )}
                  </td>
                  <td>{candidate.category}</td>
                  <td>{candidate.rationale}</td>
                  <td>{notes.length > 0 ? notes.join('; ') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
