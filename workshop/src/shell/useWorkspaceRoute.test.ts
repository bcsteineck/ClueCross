import { describe, expect, it } from 'vitest'
import { candidateDetailHash, candidateKey, editorHash, parseRouteHash, parseWorkspaceHash } from './useWorkspaceRoute'

describe('workspace routes', () => {
  it('parses a candidate detail route as the Candidates workspace', () => {
    const production = { production: false }
    expect(parseRouteHash('#/candidates', production)).toEqual({ workspace: 'candidates', candidateDetail: null, editorId: null })
    expect(parseRouteHash('#/candidates/abc123', production)).toEqual({ workspace: 'candidates', candidateDetail: 'abc123', editorId: null })
    // Malformed keys are still Candidates; the workspace replaces them.
    expect(parseRouteHash('#/candidates/', production)).toEqual({ workspace: 'candidates', candidateDetail: '', editorId: null })
    expect(parseRouteHash('#/final', production)).toEqual({ workspace: 'final', candidateDetail: null, editorId: null })
    expect(parseRouteHash('#/schedule', production)).toBeNull()
    expect(parseRouteHash('#/candidatesx', production)).toBeNull()
    expect(parseWorkspaceHash('#/candidates/abc', production)).toBeNull()
  })

  it('parses Editor routes with the edited candidate’s id, round-tripping any id', () => {
    const production = { production: false }
    expect(parseRouteHash('#/editor', production)).toEqual({ workspace: 'editor', candidateDetail: null, editorId: null })
    expect(parseRouteHash('#/editor/cand-1', production)).toEqual({ workspace: 'editor', candidateDetail: null, editorId: 'cand-1' })
    for (const id of ['cand-3f2a', 'saved-1', 'odd id/with #chars']) {
      expect(parseRouteHash(editorHash(id), production)?.editorId).toBe(id)
    }
    // A malformed escape still opens the Editor, which shows its recovery state.
    expect(parseRouteHash('#/editor/%E0%A4%A', production)).toEqual({ workspace: 'editor', candidateDetail: null, editorId: '' })
  })

  it('derives short, stable, URL-safe keys from identity signatures', () => {
    const key = candidateKey('KENNEL:0,0:across|POODLE:2,0:down')
    expect(key).toMatch(/^[a-z0-9]+$/)
    expect(key).toBe(candidateKey('KENNEL:0,0:across|POODLE:2,0:down'))
    expect(key).not.toBe(candidateKey('KENNEL:0,0:across|POODLE:3,0:down'))
    expect(candidateDetailHash(key)).toBe(`#/candidates/${key}`)
  })
})
