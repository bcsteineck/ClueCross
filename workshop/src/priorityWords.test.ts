import { describe, expect, it } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { WORKSHOP_GENERATION_CONFIG } from './generateBatch'
import { MAX_PRIORITY_WORDS, analyzePriorityWords, missingPriorityWords, togglePriorityWord } from './priorityWords'

describe('togglePriorityWord', () => {
  it('selects, deselects, and never duplicates', () => {
    const one = togglePriorityWord([], 'BEAGLE')
    expect(one).toEqual({ selection: ['BEAGLE'], limitReached: false })
    expect(togglePriorityWord(one.selection, 'KENNEL').selection).toEqual(['BEAGLE', 'KENNEL'])
    expect(togglePriorityWord(['BEAGLE', 'KENNEL'], 'BEAGLE').selection).toEqual(['KENNEL'])
  })

  it('allows 10 and refuses an eleventh without changing the selection', () => {
    expect(MAX_PRIORITY_WORDS).toBe(WORKSHOP_GENERATION_CONFIG.minAnswers)
    const ten = DOGS_CANDIDATE_POOL.slice(0, 10)
    expect(togglePriorityWord(ten.slice(0, 9), ten[9])).toEqual({ selection: ten, limitReached: false })
    expect(togglePriorityWord(ten, DOGS_CANDIDATE_POOL[10])).toEqual({ selection: ten, limitReached: true })
    // Deselecting still works at the limit.
    expect(togglePriorityWord(ten, ten[0])).toEqual({ selection: ten.slice(1), limitReached: false })
  })
})

describe('analyzePriorityWords', () => {
  it('reports nothing for no selections or available, crossable words', () => {
    expect(analyzePriorityWords([], DOGS_CANDIDATE_POOL)).toEqual([])
    expect(analyzePriorityWords(['BEAGLE', 'KENNEL'], DOGS_CANDIDATE_POOL)).toEqual([])
  })

  it('blocks on a Priority Word missing from the pool, naming it', () => {
    const pool = DOGS_CANDIDATE_POOL.filter((word) => word !== 'BEAGLE')
    expect(missingPriorityWords(['BEAGLE', 'KENNEL'], pool)).toEqual(['BEAGLE'])
    expect(analyzePriorityWords(['BEAGLE', 'KENNEL'], pool)).toEqual([
      {
        code: 'priority-word-missing',
        severity: 'error',
        message:
          'BEAGLE is a Priority Word but is no longer in your candidate list. Restore it or remove it from Priority Words to continue.',
      },
    ])
  })

  it('lists several missing words in one diagnostic', () => {
    const [diagnostic] = analyzePriorityWords(['PARROT', 'SHIP', 'GOLD'], DOGS_CANDIDATE_POOL)
    expect(diagnostic.message).toBe(
      'PARROT, SHIP, and GOLD are Priority Words but are no longer in your candidate list. Restore them or remove them from Priority Words to continue.',
    )
  })

  it('blocks more than the maximum', () => {
    const codes = analyzePriorityWords(DOGS_CANDIDATE_POOL.slice(0, 11), DOGS_CANDIDATE_POOL).map((d) => d.code)
    expect(codes).toEqual(['too-many-priority-words'])
  })

  it('blocks a word that shares no letter with any other candidate (it can never cross)', () => {
    const pool = [...DOGS_CANDIDATE_POOL, 'ZZZ']
    const diagnostics = analyzePriorityWords(['ZZZ'], pool)
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([['priority-word-isolated', 'error']])
    expect(diagnostics[0].message).toMatch(/^ZZZ shares no letters with any other candidate word/)
    // A word that shares even one letter is never rejected by this check.
    expect(analyzePriorityWords(['VET'], DOGS_CANDIDATE_POOL)).toEqual([])
  })
})
