import { describe, expect, it } from 'vitest'
import { assertTestBranchMarker, decideTestDatabase } from './testDatabaseGuard'

describe('destructive test database guard', () => {
  it('skips when no test database is configured', () => {
    expect(decideTestDatabase({})).toEqual({ run: false, reason: 'PUBLISHING_TEST_DATABASE_URL is not set.' })
    expect(decideTestDatabase({ testUrl: '  ', workshopUrl: 'postgresql://dev' })).toMatchObject({ run: false })
  })

  it('refuses when the test database is the Workshop database', () => {
    expect(() => decideTestDatabase({ testUrl: 'postgresql://same', workshopUrl: 'postgresql://same' })).toThrow(
      'equals PUBLISHING_DATABASE_URL',
    )
  })

  it('allows a distinct test database, pending the marker check', () => {
    expect(decideTestDatabase({ testUrl: 'postgresql://test', workshopUrl: 'postgresql://dev' })).toEqual({
      run: true,
      url: 'postgresql://test',
    })
  })

  it('refuses when the marker table is missing', () => {
    expect(() => assertTestBranchMarker(false)).toThrow('cluecross_test_branch marker table is missing')
    expect(() => assertTestBranchMarker(true)).not.toThrow()
  })
})
