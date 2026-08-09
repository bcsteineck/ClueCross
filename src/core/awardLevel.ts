// Fixed score bands mapped to an award tier, shown to the player once they
// complete a puzzle. Bands are absolute score thresholds, not scaled to a
// puzzle's unlockBudget — every real puzzle currently starts at the same
// DEFAULT_REVEAL_BUDGET (2000), so these are meaningful as-is.
export type AwardLevel = 'gold' | 'silver' | 'bronze' | 'bust'

export const AWARD_LABELS: Record<AwardLevel, string> = {
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
  bust: 'Bust',
}

export const AWARD_MESSAGES: Record<AwardLevel, string> = {
  gold: 'Wow! Amazing! You won the Gold award!',
  silver: 'Great job! You won the Silver award!',
  bronze: 'Not too shabby. You won the Bronze award!',
  bust: 'Oh no! You busted. Better luck next time.',
}

export function getAwardLevel(score: number): AwardLevel {
  if (score < 0) return 'bust'
  if (score >= 1200) return 'gold'
  if (score >= 600) return 'silver'
  return 'bronze'
}
