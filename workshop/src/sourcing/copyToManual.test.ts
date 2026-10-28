import { describe, expect, it } from 'vitest'
import { fixtureSourcedPool } from '../../server/draft/testDrafts'
import { setCandidateIncluded } from './reviewPool'
import { copyableSourcedWords, copySourcedToManual } from './copyToManual'

const candidates = () => fixtureSourcedPool().candidates
const included = () => copyableSourcedWords(candidates())

describe('Copy to Manual', () => {
  it('copies the included, valid sourced words, one per line, into an empty manual list', () => {
    const words = included()
    expect(words.length).toBeGreaterThan(5)
    // Invalid and duplicate sourced candidates are never copied.
    const invalid = candidates().filter((c) => c.validity === 'invalid')
    const duplicates = candidates().filter((c) => c.duplicateOf !== undefined)
    expect(invalid.length + duplicates.length).toBeGreaterThan(0)
    for (const candidate of invalid) expect(words).not.toContain(candidate.sourceAnswer)
    expect(words).toHaveLength(candidates().length - invalid.length - duplicates.length)
    expect(copySourcedToManual('', candidates())).toEqual({ poolText: words.join('\n'), added: words })
  })

  it('appends after existing manual words, keeping their text and order exactly', () => {
    const existing = 'Zebra, Lion\nTIGER'
    const { poolText, added } = copySourcedToManual(existing, candidates())
    expect(poolText).toBe(`${existing}\n${added.join('\n')}`)
    expect(poolText.startsWith(existing)).toBe(true)
    // A trailing newline isn't doubled.
    expect(copySourcedToManual('TIGER\n', candidates()).poolText).toBe(`TIGER\n${added.join('\n')}`)
  })

  it('skips words already in the manual list, ignoring case, spaces, hyphens, and apostrophes', () => {
    const [first, second, ...rest] = included()
    const manual = `${first.toLowerCase()}\n  ${second.toUpperCase().split('').join(' ')}  `
    const { added } = copySourcedToManual(manual, candidates())
    expect(added).toEqual(rest)
  })

  it('copies only the included words, and never changes the sourced candidates', () => {
    const pool = candidates()
    const before = structuredClone(pool)
    const excluded = pool.find((c) => c.included)!
    const reviewed = setCandidateIncluded(pool, excluded.id, false)
    const { added } = copySourcedToManual('', reviewed)
    expect(added).not.toContain(excluded.sourceAnswer)
    expect(added).toHaveLength(included().length - 1)
    expect(pool).toEqual(before)
  })

  it('adds nothing on a repeat copy', () => {
    const once = copySourcedToManual('Zebra', candidates()).poolText
    expect(copySourcedToManual(once, candidates())).toEqual({ poolText: once, added: [] })
  })

  it('handles an empty sourced list, or one with nothing included, safely', () => {
    expect(copySourcedToManual('Zebra', [])).toEqual({ poolText: 'Zebra', added: [] })
    const none = candidates().reduce((pool, c) => setCandidateIncluded(pool, c.id, false), candidates())
    expect(copyableSourcedWords(none)).toEqual([])
    expect(copySourcedToManual('', none)).toEqual({ poolText: '', added: [] })
  })
})
