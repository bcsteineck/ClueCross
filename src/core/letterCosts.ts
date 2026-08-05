// Fixed reveal-credit economy. Letter costs are constant across every
// puzzle — never derived from a puzzle's letter distribution, cell count,
// difficulty, or remaining budget. The reveal keyboard must not leak any
// information about the current puzzle by varying prices.

export type Letter =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'

export const LETTER_COSTS: Readonly<Record<Letter, number>> = {
  A: 160,
  B: 70,
  C: 110,
  D: 100,
  E: 170,
  F: 70,
  G: 80,
  H: 80,
  I: 150,
  J: 30,
  K: 50,
  L: 120,
  M: 90,
  N: 130,
  O: 140,
  P: 90,
  Q: 30,
  R: 150,
  S: 130,
  T: 140,
  U: 110,
  V: 50,
  W: 60,
  X: 40,
  Y: 60,
  Z: 30,
}

export const DEFAULT_REVEAL_BUDGET = 2000

function isLetter(value: string): value is Letter {
  return Object.hasOwn(LETTER_COSTS, value)
}

// Accepts a plain string (callers pass user/state-derived values, not the
// Letter type) and normalizes case, but never widens LETTER_COSTS itself
// to accept anything other than a real A-Z letter.
export function getLetterCost(letter: string): number {
  const normalized = letter.toUpperCase()
  if (!isLetter(normalized)) {
    throw new Error(`getLetterCost: "${letter}" is not a single A-Z letter.`)
  }
  return LETTER_COSTS[normalized]
}
