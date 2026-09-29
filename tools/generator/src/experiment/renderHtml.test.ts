import { describe, expect, it } from 'vitest'
import { mobileCellSizePx, renderExperimentHtml } from './renderHtml'
import { runGridSizeExperiment } from './gridSizeExperiment'

const SMALL_CONFIG = {
  candidatePool: ['CAT', 'TIE', 'EAR', 'ART', 'RAT'],
  seed: 'html-test-seed',
  minAnswers: 2,
  maxAnswers: 3,
  maxSubsetTrials: 20,
  sizes: [
    { maxWidth: 9, maxHeight: 9 },
    { maxWidth: 12, maxHeight: 12 },
    { maxWidth: 16, maxHeight: 16 },
    { maxWidth: 20, maxHeight: 20 },
  ],
}

describe('mobileCellSizePx', () => {
  it('divides the container width by the larger of width/height', () => {
    expect(mobileCellSizePx(9, 6, 360)).toBeCloseTo(40, 10) // 360 / 9
    expect(mobileCellSizePx(6, 9, 360)).toBeCloseTo(40, 10) // 360 / 9 (height is larger)
  })

  it('gives a square puzzle a straightforward cell size', () => {
    expect(mobileCellSizePx(12, 12, 360)).toBeCloseTo(30, 10)
  })

  it('defaults the container to 360px', () => {
    expect(mobileCellSizePx(9, 9)).toBeCloseTo(40, 10)
  })
})

describe('renderExperimentHtml', () => {
  const result = runGridSizeExperiment(SMALL_CONFIG)
  const html = renderExperimentHtml(result, { poolLabel: 'Test Pool' })

  it('contains a section for every configured size', () => {
    for (const size of SMALL_CONFIG.sizes) {
      expect(html).toContain(`id="size-${size.maxWidth}x${size.maxHeight}"`)
    }
  })

  it('contains a methodology section', () => {
    expect(html).toContain('Methodology')
    expect(html).toContain('No cross-size quality ranking')
  })

  it('states the search budget and the no-incidental-entry geometry rule', () => {
    expect(html).toContain('Search budget: 10000 placement attempts per trial (the generator default)')
    expect(html).toContain('Incidental entries are invalid')
    expect(html).toContain('Median incidental entries (must be 0)')
  })

  it('reports each representative’s cell size at 360px', () => {
    expect(html).toMatch(/Cell size @ 360px<\/dt>\s*<dd>[\d.]+px \(360 \/ max\(\d+, \d+\)\)/)
  })

  it('contains a cross-size summary table', () => {
    expect(html).toContain('cc-summary-table')
    expect(html).toContain('Cross-size summary')
  })

  it('contains representative boards for sizes with viable candidates', () => {
    const sizesWithCandidates = result.sizes.filter((s) => s.uniqueCandidateCount > 0)
    expect(sizesWithCandidates.length).toBeGreaterThan(0)
    expect((html.match(/class="cc-board"/g) ?? []).length).toBeGreaterThan(0)
  })

  it('contains selected and unselected answer data for representatives', () => {
    expect(html).toContain('Selected answers')
    expect(html).toContain('Unselected answers')
  })

  it('contains the 360px geometric cell-size comparison view', () => {
    expect(html).toContain('Fitted to a 360px board')
  })

  it('contains no external framework/CDN dependencies', () => {
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).not.toMatch(/<script\s+src=/i)
    expect(html).not.toMatch(/<link[^>]*stylesheet/i)
  })

  it('never labels a representative "best", "worst", "winner", or "loser"', () => {
    const forbidden = ['best', 'worst', 'winner', 'loser']
    const labelMatches = html.match(/class="cc-representative-label">([^<]*)</g) ?? []
    for (const match of labelMatches) {
      const lower = match.toLowerCase()
      for (const word of forbidden) {
        expect(lower).not.toContain(word)
      }
    }
  })

  it('is valid, well-formed enough HTML: one doctype, one html/head/body', () => {
    expect(html.trim().startsWith('<!doctype html>')).toBe(true)
    expect((html.match(/<html/g) ?? []).length).toBe(1)
    expect((html.match(/<\/html>/g) ?? []).length).toBe(1)
    expect((html.match(/<body>/g) ?? []).length).toBe(1)
  })

  it('handles a size with zero viable candidates without producing a broken section', () => {
    const zeroResult = runGridSizeExperiment({
      candidatePool: ['CAT', 'DOG'],
      seed: 'zero-html',
      minAnswers: 2,
      maxAnswers: 2,
      maxSubsetTrials: 3,
      sizes: [{ maxWidth: 9, maxHeight: 9 }],
    })
    const zeroHtml = renderExperimentHtml(zeroResult)
    expect(zeroHtml).toContain('No viable candidates at this size.')
  })
})
