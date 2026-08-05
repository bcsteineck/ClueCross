export interface CompletionBannerProps {
  isComplete: boolean
  remainingBudget: number
}

export function CompletionBanner({ isComplete, remainingBudget }: CompletionBannerProps) {
  return (
    <p aria-live="polite">
      {isComplete ? `Puzzle complete! Your Score is ${remainingBudget}.` : ''}
    </p>
  )
}
