// Fixed score bands mapped to an award tier, shown to the player once they
// complete a puzzle. Bands are absolute score thresholds, not scaled to a
// puzzle's unlockBudget — every real puzzle currently starts at the same
// DEFAULT_REVEAL_BUDGET (2000), so these are meaningful as-is.
export type AwardLevel = 'gold' | 'silver' | 'bronze' | 'bust'

export function getAwardLevel(score: number): AwardLevel {
  if (score < 0) return 'bust'
  if (score >= 1200) return 'gold'
  if (score >= 600) return 'silver'
  return 'bronze'
}

// v0.2.0 presents award tiers as a 0-3 star rating rather than
// Gold/Silver/Bronze/Bust text. Reuses the existing thresholds above
// unchanged — only the presentation differs.
const AWARD_STAR_COUNTS: Record<AwardLevel, 0 | 1 | 2 | 3> = {
  gold: 3,
  silver: 2,
  bronze: 1,
  bust: 0,
}

export function getStarCount(score: number): 0 | 1 | 2 | 3 {
  return AWARD_STAR_COUNTS[getAwardLevel(score)]
}
