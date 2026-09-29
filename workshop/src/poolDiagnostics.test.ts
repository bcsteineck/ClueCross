import { describe, expect, it } from 'vitest'
import {
  analyzeCandidatePool,
  buildPoolSummary,
  formatThresholdAverage,
  formatThresholdPercentage,
  roundHalfUp,
} from './poolDiagnostics'
import type { DiagnosticCode } from './poolDiagnostics'

// `count` unique A–Z words of exactly `length` letters (length >= 3).
let serial = 0
function words(count: number, length: number): string[] {
  return Array.from({ length: count }, () => {
    const n = serial++
    const suffix = String.fromCharCode(65 + Math.floor(n / 26) % 26) + String.fromCharCode(65 + (n % 26))
    return 'Q'.repeat(length - 2) + suffix
  })
}

const codes = (entries: string[]) => analyzeCandidatePool(entries).diagnostics.map((d) => d.code)
const CANONICAL: DiagnosticCode[] = [
  'not-enough-answers',
  'small-pool',
  'few-short-answers',
  'many-long-answers',
  'high-average-length',
  'duplicates-removed',
  'invalid-entries-excluded',
]

describe('analyzeCandidatePool: counts and eligibility', () => {
  it('blank input: only the not-enough error, nothing else', () => {
    const analysis = analyzeCandidatePool(['', ' ', '\n'])
    expect(analysis.stats).toMatchObject({ usableCount: 0, invalidCount: 0, duplicateCount: 0, meanLength: null })
    expect(analysis.diagnostics.map((d) => d.code)).toEqual(['not-enough-answers'])
    expect(analysis.diagnostics[0].message).toBe(
      'Not enough candidate answers. Add at least 10 valid, unique answers to generate a puzzle. Currently: 0.',
    )
    expect(analysis.canGenerate).toBe(false)
  })

  it('9 usable answers: error without the small-pool warning; length warnings may still apply', () => {
    const analysis = analyzeCandidatePool(words(9, 6))
    expect(analysis.diagnostics[0].code).toBe('not-enough-answers')
    expect(codes(words(9, 6))).not.toContain('small-pool')
    expect(codes(words(9, 6))).toContain('few-short-answers')
    expect(analysis.canGenerate).toBe(false)
  })

  it('exactly 10 usable answers: small-pool warning, generation allowed', () => {
    const analysis = analyzeCandidatePool([...words(2, 4), ...words(8, 6)])
    expect(analysis.diagnostics.map((d) => d.code)).toEqual(['small-pool'])
    expect(analysis.diagnostics[0].message).toBe(
      'Small candidate pool. 30+ answers are recommended to give the generator more construction options. Currently: 10.',
    )
    expect(analysis.canGenerate).toBe(true)
  })

  it('exactly 30 usable answers: no minimum error and no small-pool warning', () => {
    expect(codes([...words(6, 4), ...words(24, 6)])).toEqual([])
  })

  it('removes duplicate valid entries after normalization, counting each removed entry', () => {
    const analysis = analyzeCandidatePool(['BEAGLE', 'beagle', ' BEAGLE ', 'POODLE'])
    expect(analysis.usableAnswers).toEqual(['BEAGLE', 'POODLE'])
    expect(analysis.duplicatesRemoved).toEqual(['BEAGLE', 'BEAGLE'])
    const info = analysis.diagnostics.find((d) => d.code === 'duplicates-removed')
    expect(info).toEqual({
      code: 'duplicates-removed',
      severity: 'info',
      message: '2 duplicate entries removed.',
      entries: ['BEAGLE', 'BEAGLE'],
    })
    expect(analyzeCandidatePool(['PUG', 'pug']).diagnostics.find((d) => d.code === 'duplicates-removed')?.message).toBe(
      '1 duplicate entry removed.',
    )
  })

  it('counts repeated invalid entries individually, never as duplicates', () => {
    const analysis = analyzeCandidatePool(['INVALID!', 'INVALID!', 'INVALID!'])
    expect(analysis.stats).toMatchObject({ invalidCount: 3, duplicateCount: 0 })
    expect(analysis.diagnostics.find((d) => d.code === 'invalid-entries-excluded')).toEqual({
      code: 'invalid-entries-excluded',
      severity: 'info',
      message: '3 invalid entries excluded.',
      entries: ['INVALID!', 'INVALID!', 'INVALID!'],
    })
  })

  it('treats 2-letter entries as invalid before duplicate handling and statistics', () => {
    const analysis = analyzeCandidatePool(['OX', 'ox', ' OX ', 'PUG'])
    expect(analysis.invalidEntries).toEqual(['OX', 'ox', 'OX'])
    expect(analysis.duplicatesRemoved).toEqual([])
    expect(analysis.stats).toMatchObject({ usableCount: 1, shortCount: 1, invalidCount: 3, duplicateCount: 0, meanLength: 3 })
  })

  it('uses the generator’s rules: non A–Z and fewer than 3 letters are invalid (trimmed value kept)', () => {
    const analysis = analyzeCandidatePool([' OX ', 'HOT-DOG', 'ICE CREAM', 'PUG'])
    expect(analysis.invalidEntries).toEqual(['OX', 'HOT-DOG', 'ICE CREAM'])
    expect(analysis.usableAnswers).toEqual(['PUG'])
  })

  it('cleanup that leaves fewer than 10 blocks generation and reports what was removed', () => {
    const usable = words(8, 6)
    const raw = [...usable, usable[0], usable[1], usable[2].toLowerCase(), usable[3], 'BAD-1', 'BAD-2', 'X']
    expect(raw).toHaveLength(15)
    const analysis = analyzeCandidatePool(raw)
    expect(analysis.stats).toMatchObject({ usableCount: 8, duplicateCount: 4, invalidCount: 3 })
    expect(codes(raw)).toEqual(['not-enough-answers', 'few-short-answers', 'duplicates-removed', 'invalid-entries-excluded'])
    expect(analysis.canGenerate).toBe(false)
  })

  it('warnings and info never block generation', () => {
    const analysis = analyzeCandidatePool([...words(10, 10), 'BAD!', words(1, 10)[0]])
    expect(analysis.diagnostics.some((d) => d.severity === 'warning')).toBe(true)
    expect(analysis.diagnostics.some((d) => d.severity === 'info')).toBe(true)
    expect(analysis.canGenerate).toBe(true)
  })
})

describe('analyzeCandidatePool: length statistics and thresholds', () => {
  it('buckets usable answers into 3–5 / 6–8 / 9+ and computes ratios and mean', () => {
    const analysis = analyzeCandidatePool([...words(3, 3), ...words(2, 5), ...words(3, 6), ...words(2, 12)])
    expect(analysis.stats).toEqual({
      usableCount: 10,
      shortCount: 5,
      mediumCount: 3,
      longCount: 2,
      shortRatio: 0.5,
      mediumRatio: 0.3,
      longRatio: 0.2,
      meanLength: (9 + 10 + 18 + 24) / 10,
      duplicateCount: 0,
      invalidCount: 0,
    })
  })

  it('exactly 20% short does not warn; below 20% does', () => {
    expect(codes([...words(2, 4), ...words(8, 6)])).not.toContain('few-short-answers')
    const analysis = analyzeCandidatePool([...words(1, 4), ...words(9, 6)])
    expect(analysis.diagnostics.find((d) => d.code === 'few-short-answers')?.message).toBe(
      'Few short answers. Only 10% of the pool is 3–5 letters. Shorter answers can give the generator more placement options.',
    )
  })

  it('exactly 40% long does not warn; above 40% does', () => {
    expect(codes([...words(2, 4), ...words(4, 6), ...words(4, 9)])).not.toContain('many-long-answers')
    const analysis = analyzeCandidatePool([...words(2, 4), ...words(3, 6), ...words(5, 9)])
    expect(analysis.diagnostics.find((d) => d.code === 'many-long-answers')?.message).toBe(
      'Many long answers. 50% of the pool is 9+ letters, which can make 12×12 construction more difficult.',
    )
  })

  it('mean length exactly 7.0 does not warn', () => {
    // 2×4 + 7×8 + 1×6 = 70 → mean exactly 7.
    const exact = [...words(2, 4), ...words(7, 8), ...words(1, 6)]
    expect(analyzeCandidatePool(exact).stats.meanLength).toBe(7)
    expect(codes(exact)).not.toContain('high-average-length')
  })

  it('few short + many long + high average: shows few short and many long, suppresses high average', () => {
    // 1×3 + 4×6 + 5×9 = 72 → mean 7.2; short 10%, long 50%.
    expect(codes([...words(1, 3), ...words(4, 6), ...words(5, 9)])).toEqual([
      'small-pool',
      'few-short-answers',
      'many-long-answers',
    ])
  })

  it('few short + high average without many long: shows both', () => {
    // 1×3 + 6×8 + 3×9 = 78 → mean 7.8; short 10%, long 30%.
    const analysis = analyzeCandidatePool([...words(1, 3), ...words(6, 8), ...words(3, 9)])
    expect(analysis.diagnostics.map((d) => d.code)).toEqual(['small-pool', 'few-short-answers', 'high-average-length'])
    expect(analysis.diagnostics[2].message).toBe(
      'High average answer length. The average answer is 7.8 letters, which can make 12×12 construction more difficult.',
    )
  })

  it('many long + high average without few short: shows many long only', () => {
    // 2×3 + 3×8 + 5×10 = 80 → mean 8; short exactly 20%, long 50%.
    expect(codes([...words(2, 3), ...words(3, 8), ...words(5, 10)])).toEqual(['small-pool', 'many-long-answers'])
  })

  it('always emits diagnostics in canonical order', () => {
    // 8 usable: 1 short (12.5%), 2 medium, 5 long (62.5%); plus a duplicate and an invalid entry.
    const long = words(5, 9)
    const raw = [...words(1, 3), ...words(2, 6), ...long, long[0].toLowerCase(), 'bad!']
    const emitted = codes(raw)
    expect(emitted).toEqual(CANONICAL.filter((code) => emitted.includes(code)))
    expect(emitted).toEqual(['not-enough-answers', 'few-short-answers', 'many-long-answers', 'duplicates-removed', 'invalid-entries-excluded'])
  })
})

describe('presentation helpers', () => {
  it('rounds half up', () => {
    expect(roundHalfUp(2.5, 0)).toBe(3)
    expect(roundHalfUp(19.45, 1)).toBe(19.5)
    expect(roundHalfUp(0.125, 2)).toBe(0.13)
  })

  it('never shows a threshold-crossing percentage as the threshold itself', () => {
    expect(formatThresholdPercentage(0.19, 0.2)).toBe('19%')
    expect(formatThresholdPercentage(0.196, 0.2)).toBe('19.6%')
    expect(formatThresholdPercentage(0.404, 0.4)).toBe('40.4%')
    expect(formatThresholdPercentage(0.416, 0.4)).toBe('42%')
    expect(formatThresholdPercentage(0, 0.2)).toBe('0%')
  })

  it('never shows a threshold-crossing average as the threshold itself', () => {
    expect(formatThresholdAverage(7.04, 7)).toBe('7.04')
    expect(formatThresholdAverage(7.06, 7)).toBe('7.1')
    expect(formatThresholdAverage(7.44, 7)).toBe('7.4')
  })

  it('builds the pool summary, including the empty case', () => {
    const empty = analyzeCandidatePool([])
    expect(buildPoolSummary(empty.stats)).toEqual({
      headline: '0 usable answers',
      short: '3–5: 0',
      medium: '6–8: 0',
      long: '9+: 0',
      average: 'Average: —',
    })
    expect(buildPoolSummary(analyzeCandidatePool(['PUG']).stats)).toEqual({
      headline: '1 usable answer',
      short: '3–5: 1',
      medium: '6–8: 0',
      long: '9+: 0',
      average: 'Average: 3.0 letters',
    })
  })
})
