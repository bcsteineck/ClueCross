import { describe, expect, it } from 'vitest'
import { assignEntryIds, derivePlayableEntries } from '../../tools/generator/src/derive/derivePlayableEntries.js'
import { DEFAULT_MAX_ATTEMPTS } from '../../tools/generator/src/placement/backtrack.js'
import { DOGS_BREEDS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsBreedsCandidatePool.js'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { generateCandidatePoolSelection } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import {
  MAX_DISPLAYED_CANDIDATES,
  WORKSHOP_GENERATION_CONFIG,
  formatMobileCellSize,
  generateBatch,
  generationSeed,
} from './generateBatch'
import { parsePool } from './parsePool'

const dogsPool = parsePool(DOGS_CANDIDATE_POOL.join('\n'))
// Long-word pool: at 10–16 answers, batch 4 finds no candidates and batch 2
// finds four — real small/empty results, not mocks.
const breedsPool = parsePool(DOGS_BREEDS_CANDIDATE_POOL.join('\n'))

function generateOk(generationNumber: number, pool = dogsPool) {
  const result = generateBatch('Dogs', pool, generationNumber)
  if (!result.ok) throw new Error(result.errors.join(' '))
  return result.batch
}

describe('generateBatch', () => {
  it('requires a clue', () => {
    const result = generateBatch('   ', dogsPool, 1)
    expect(result).toEqual({ ok: false, errors: ['Enter a clue.'] })
  })

  it('blocks generation with fewer than 10 valid unique words', () => {
    const nine = parsePool(DOGS_CANDIDATE_POOL.slice(0, 9).join('\n'))
    const result = generateBatch('Dogs', nine, 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toEqual([nine.diagnostics[0].message])
    expect(nine.diagnostics[0]).toMatchObject({ code: 'not-enough-answers', severity: 'error' })
  })

  it('accepts a pool of exactly 10 valid unique words', () => {
    const ten = parsePool(DOGS_CANDIDATE_POOL.slice(0, 10).join('\n'))
    expect(generateBatch('Dogs', ten, 1).ok).toBe(true)
  })

  it('generates from usable answers only: duplicates removed, invalid entries excluded', () => {
    const noisy = parsePool(`${DOGS_CANDIDATE_POOL.join('\n')}\nK9\nbeagle\nOX`)
    const result = generateBatch('Dogs', noisy, 1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.batch.pool).toEqual(DOGS_CANDIDATE_POOL)
    // Same batch as the clean pool: excluded/removed entries play no part.
    expect(result.batch.candidates).toEqual(generateOk(1).candidates)
  })

  it('uses the 12x12 envelope, 10–16 answers, 100 trials, and 5 × 2,000 construction restarts (10,000 maximum)', () => {
    expect(WORKSHOP_GENERATION_CONFIG).toEqual({
      maxWidth: 12,
      maxHeight: 12,
      minAnswers: 10,
      maxAnswers: 16,
      maxSubsetTrials: 100,
      constructionRestarts: { restarts: 5, attemptsPerRestart: 2000 },
    })
    // The per-trial maximum stays equal to the generator's single-search default.
    const { restarts, attemptsPerRestart } = WORKSHOP_GENERATION_CONFIG.constructionRestarts
    expect(restarts * attemptsPerRestart).toBe(DEFAULT_MAX_ATTEMPTS)
    expect('maxAttempts' in WORKSHOP_GENERATION_CONFIG).toBe(false)
    expect(generateOk(1).diversity.subsetTrialsAttempted).toBe(100)

    const batch = generateOk(1)
    expect(batch.candidates.length).toBeGreaterThan(0)
    for (const candidate of batch.candidates) {
      expect(candidate.construction.width).toBeLessThanOrEqual(12)
      expect(candidate.construction.height).toBeLessThanOrEqual(12)
      expect(candidate.metrics.geometry.configuredMaxWidth).toBe(12)
      expect(candidate.metrics.geometry.configuredMaxHeight).toBe(12)
      expect(candidate.answerCount).toBeGreaterThanOrEqual(10)
      expect(candidate.answerCount).toBeLessThanOrEqual(16)
    }
  })

  it('displays at most 20 unique candidates, in generation order', () => {
    // Batch 3 of the 18-word pool finds 22 unique candidates at 10–16.
    const batch = generateOk(3)
    expect(MAX_DISPLAYED_CANDIDATES).toBe(20)
    expect(batch.diversity.uniqueCandidateCount).toBeGreaterThan(MAX_DISPLAYED_CANDIDATES)
    expect(batch.candidates).toHaveLength(MAX_DISPLAYED_CANDIDATES)
    expect(new Set(batch.candidates.map((c) => c.identitySignature)).size).toBe(batch.candidates.length)
    const trialOrder = batch.candidates.map((c) => c.representativeTrialIndex)
    expect(trialOrder).toEqual([...trialOrder].sort((a, b) => a - b))
  })

  it('derives a distinct, reproducible seed per generation number', () => {
    expect(generationSeed(1)).toBe('workshop-generation-1')
    const first = generateOk(1)
    const second = generateOk(2)
    const firstAgain = generateOk(1)

    expect(first.seed).toBe('workshop-generation-1')
    expect(second.seed).toBe('workshop-generation-2')
    expect(firstAgain.candidates.map((c) => c.identitySignature)).toEqual(
      first.candidates.map((c) => c.identitySignature),
    )
    expect(second.candidates.map((c) => c.identitySignature)).not.toEqual(
      first.candidates.map((c) => c.identitySignature),
    )
  })

  it('only returns candidates whose authored answers are recoverable as playable entries', () => {
    for (const candidate of generateOk(1).candidates) {
      const { placedAnswers, positions } = candidate.construction
      expect(assignEntryIds(derivePlayableEntries(positions), placedAnswers, positions).ok).toBe(true)
    }
  })

  it('every displayed Dogs candidate has zero incidental entries (derived entries = authored answers)', () => {
    for (const generationNumber of [1, 2, 3]) {
      for (const candidate of generateOk(generationNumber).candidates) {
        expect(candidate.metrics.derivedEntries.incidentalEntryCount).toBe(0)
        expect(candidate.metrics.derivedEntries.derivedEntryCount).toBe(candidate.answerCount)
      }
    }
  })

  it('tracks selected and unselected words against the pool', () => {
    const batch = generateOk(1)
    for (const candidate of batch.candidates) {
      expect([...candidate.selectedAnswers, ...candidate.unselectedAnswers].sort()).toEqual([...batch.pool].sort())
    }
  })

  it('never attempts a subset larger than a 10–15-word pool', () => {
    const twelveWords = DOGS_CANDIDATE_POOL.slice(0, 12)
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: twelveWords,
      seed: generationSeed(1),
      ...WORKSHOP_GENERATION_CONFIG,
    })
    if (!result.ok) throw new Error(result.reason)
    const sizes = new Set(result.subsetTrials.map((t) => t.attemptedSubset.length))
    expect([...sizes].sort((a, b) => a - b)).toEqual([10, 11, 12])
  })

  it('explores the full 10–16 range for a pool of 16+ words', () => {
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: DOGS_CANDIDATE_POOL,
      seed: generationSeed(1),
      ...WORKSHOP_GENERATION_CONFIG,
    })
    if (!result.ok) throw new Error(result.reason)
    const sizes = new Set(result.subsetTrials.map((t) => t.attemptedSubset.length))
    expect([...sizes].sort((a, b) => a - b)).toEqual([10, 11, 12, 13, 14, 15, 16])
  })

  it('returns an empty batch (no fallback to fewer answers) when nothing fits', () => {
    const batch = generateOk(4, breedsPool)
    expect(batch.candidates).toEqual([])
    expect(batch.diversity.subsetTrialsAttempted).toBe(100)
  })

  it('returns fewer than 20 candidates when that is all the batch finds', () => {
    const batch = generateOk(2, breedsPool)
    expect(batch.candidates).toHaveLength(4)
    for (const candidate of batch.candidates) {
      expect(candidate.answerCount).toBeGreaterThanOrEqual(10)
      expect(candidate.metrics.derivedEntries.incidentalEntryCount).toBe(0)
      expect(candidate.metrics.derivedEntries.derivedEntryCount).toBe(candidate.answerCount)
    }
  })

  it('trims the clue', () => {
    expect(generateBatch('  Dogs  ', dogsPool, 1)).toMatchObject({ ok: true, batch: { clue: 'Dogs' } })
  })
})

describe('formatMobileCellSize', () => {
  it('is 360 / max(width, height), rounded to one decimal only where needed', () => {
    expect(formatMobileCellSize(9, 7)).toBe('40px')
    expect(formatMobileCellSize(8, 10)).toBe('36px')
    expect(formatMobileCellSize(11, 9)).toBe('32.7px')
    expect(formatMobileCellSize(12, 12)).toBe('30px')
  })
})
