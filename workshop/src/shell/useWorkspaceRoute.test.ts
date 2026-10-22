import { describe, expect, it } from 'vitest'
import { candidateDetailHash, candidateKey, parseRouteHash, parseWorkspaceHash } from './useWorkspaceRoute'

describe('workspace routes', () => {
  it('parses a candidate detail route as the Candidates workspace', () => {
    const production = { production: false }
    expect(parseRouteHash('#/candidates', production)).toEqual({ workspace: 'candidates', candidateDetail: null })
    expect(parseRouteHash('#/candidates/abc123', production)).toEqual({ workspace: 'candidates', candidateDetail: 'abc123' })
    // Malformed keys are still Candidates; the workspace replaces them.
    expect(parseRouteHash('#/candidates/', production)).toEqual({ workspace: 'candidates', candidateDetail: '' })
    expect(parseRouteHash('#/final', production)).toEqual({ workspace: 'final', candidateDetail: null })
    expect(parseRouteHash('#/schedule', production)).toBeNull()
    expect(parseRouteHash('#/candidatesx', production)).toBeNull()
    expect(parseWorkspaceHash('#/candidates/abc', production)).toBeNull()
  })

  it('derives short, stable, URL-safe keys from identity signatures', () => {
    const key = candidateKey('KENNEL:0,0:across|POODLE:2,0:down')
    expect(key).toMatch(/^[a-z0-9]+$/)
    expect(key).toBe(candidateKey('KENNEL:0,0:across|POODLE:2,0:down'))
    expect(key).not.toBe(candidateKey('KENNEL:0,0:across|POODLE:3,0:down'))
    expect(candidateDetailHash(key)).toBe(`#/candidates/${key}`)
  })
})
