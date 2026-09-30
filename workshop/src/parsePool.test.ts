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

  it('keeps manual entries of up to 12 construction letters and excludes longer ones', () => {
    const parsed = parsePool('Border Collie\nCentral Processing Unit\nDOG')
    expect(parsed.usableAnswers).toEqual(['BORDERCOLLIE', 'DOG'])
    expect(parsed.invalidEntries).toEqual(['Central Processing Unit'])
  })

  it('does not split on spaces: a multi-word entry is one answer in construction form', () => {
    const parsed = parsePool('BEAGLE\nHOT-DOG\nICE CREAM\nK9\nOX')
    expect(parsed.usableAnswers).toEqual(['BEAGLE', 'HOTDOG', 'ICECREAM'])
    expect(parsed.invalidEntries).toEqual(['K9', 'OX'])
  })
})
