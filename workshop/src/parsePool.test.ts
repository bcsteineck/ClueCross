import { describe, expect, it } from 'vitest'
import { parsePool } from './parsePool'

describe('parsePool', () => {
  it('splits newline-separated words', () => {
    expect(parsePool('BEAGLE\nPOODLE\nCOLLIE').words).toEqual(['BEAGLE', 'POODLE', 'COLLIE'])
  })

  it('splits comma-separated words', () => {
    expect(parsePool('BEAGLE, POODLE,COLLIE ,  CORGI').words).toEqual(['BEAGLE', 'POODLE', 'COLLIE', 'CORGI'])
  })

  it('tolerates mixed separators, tabs, CRLF, and surrounding whitespace', () => {
    expect(parsePool('  BEAGLE\t\r\nPOODLE, COLLIE\n\tCORGI  ').words).toEqual([
      'BEAGLE',
      'POODLE',
      'COLLIE',
      'CORGI',
    ])
  })

  it('uppercases words', () => {
    expect(parsePool('beagle\nPoodle').words).toEqual(['BEAGLE', 'POODLE'])
  })

  it('ignores blank entries', () => {
    const parsed = parsePool('\n\nBEAGLE\n\n,,\n  \nPOODLE\n')
    expect(parsed.words).toEqual(['BEAGLE', 'POODLE'])
    expect(parsed.invalid).toEqual([])
  })

  it('surfaces duplicates (case-insensitive) with their counts', () => {
    const parsed = parsePool('BEAGLE\nbeagle\nPOODLE\nBeagle\nPOODLE')
    expect(parsed.words).toEqual(['BEAGLE', 'POODLE'])
    expect(parsed.duplicates).toEqual([
      { word: 'BEAGLE', count: 3 },
      { word: 'POODLE', count: 2 },
    ])
  })

  it('surfaces invalid words with the generator’s own reason, never silently dropping them', () => {
    const parsed = parsePool('BEAGLE\nHOT-DOG\nICE CREAM\nK9\nA')
    expect(parsed.words).toEqual(['BEAGLE'])
    expect(parsed.invalid.map((item) => item.raw)).toEqual(['HOT-DOG', 'ICE CREAM', 'K9', 'A'])
    expect(parsed.invalid[0].reason).toMatch(/outside A-Z/)
    expect(parsed.invalid[3].reason).toMatch(/too short/)
  })
})
