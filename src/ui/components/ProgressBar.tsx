import type { ProgressSummary } from '../../core/progress'
import './ProgressBar.scss'

export interface ProgressBarProps {
  progress: ProgressSummary
}

// Purely presentational — filled/total/percent all come from the single
// core/progress.ts getProgress() call already made by the caller, so all
// three displays here stay in sync by construction (spec section 13).
export function ProgressBar({ progress }: ProgressBarProps) {
  const { filled, total, percent } = progress
  return (
    <div className="progress-bar">
      <div className="progress-bar__summary">
        <span className="progress-bar__fraction">
          {filled} / {total} cells filled
        </span>
        <span className="progress-bar__percent">{percent}%</span>
      </div>
      <div
        className="progress-bar__track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Puzzle progress"
      >
        <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
