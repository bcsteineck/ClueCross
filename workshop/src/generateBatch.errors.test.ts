import { describe, expect, it, vi } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { generateBatch } from './generateBatch'
import { parsePool } from './parsePool'

// A violated generator invariant (here simulated) is reported as an
// unexpected error, never as an empty or partial batch.
vi.mock('../../tools/generator/src/pool/generateCandidatePoolSelection.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  generateCandidatePoolSelection: () => {
    throw new Error('Internal error: candidate from trial 3 is missing required answer(s) BEAGLE.')
  },
}))

describe('generateBatch: unexpected generator errors', () => {
  it('reports a thrown generator invariant as an unexpected error', () => {
    const result = generateBatch('Dogs', parsePool(DOGS_CANDIDATE_POOL.join('\n')), 1, ['BEAGLE'])
    expect(result).toEqual({
      ok: false,
      errors: ['Unexpected generator error: Internal error: candidate from trial 3 is missing required answer(s) BEAGLE.'],
    })
  })
})
