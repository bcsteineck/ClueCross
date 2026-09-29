import { describe, expect, it } from 'vitest'
import { parsePool } from './parsePool'

describe('parsePool', () => {
  it('splits newline-separated words', () => {
    expect(parsePool('BEAGLE\nPOODLE\nCOLLIE').usableAnswers).toEqual(['BEAGLE', 'POODLE', 'COLLIE'])
  })

  it('splits comma-separated words', () => {
    expect(parsePool('BEAGLE, POODLE,COLLIE ,  CORGI').usableAnswers).toEqual(['BEAGLE', 'POODLE', 'COLLIE', 'CORGI'])
  })

  it('tolerates mixed separators, tabs, CRLF, and surrounding whitespace', () => {
    expect(parsePool('  BEAGLE\t\r\nPOODLE, COLLIE\n\tCORGI  ').usableAnswers).toEqual([
      'BEAGLE',
      'POODLE',
      'COLLIE',
      'CORGI',
    ])
  })

  it('uppercases words', () => {
    expect(parsePool('beagle\nPoodle').usableAnswers).toEqual(['BEAGLE', 'POODLE'])
  })

  it('ignores blank entries entirely (not invalid, not duplicates)', () => {
    const parsed = parsePool('\n\nBEAGLE\n\n,,\n  \nPOODLE\n')
    expect(parsed.usableAnswers).toEqual(['BEAGLE', 'POODLE'])
    expect(parsed.invalidEntries).toEqual([])
    expect(parsed.duplicatesRemoved).toEqual([])
  })

  it('removes case-insensitive duplicates and reports each removed entry', () => {
    const parsed = parsePool('BEAGLE\nbeagle\nPOODLE\nBeagle\nPOODLE')
    expect(parsed.usableAnswers).toEqual(['BEAGLE', 'POODLE'])
    expect(parsed.duplicatesRemoved).toEqual(['BEAGLE', 'BEAGLE', 'POODLE'])
  })

  it('does not split on spaces: a multi-word entry is excluded as invalid, never silently split', () => {
    const parsed = parsePool('BEAGLE\nHOT-DOG\nICE CREAM\nK9\nOX')
    expect(parsed.usableAnswers).toEqual(['BEAGLE'])
    expect(parsed.invalidEntries).toEqual(['HOT-DOG', 'ICE CREAM', 'K9', 'OX'])
  })
})
