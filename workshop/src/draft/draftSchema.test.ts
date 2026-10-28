import { describe, expect, it } from 'vitest'
import { DEV_PUBLICATION, dogsBatch, envelopeOf, fullDraft, legacyEnvelopeOf } from '../../server/draft/testDrafts'
import { candidateFingerprint } from '../candidateFingerprint'
import { createInitialDraft, createInitialSession, workshopReducer } from '../state/workshopReducer'
import { DRAFT_SCHEMA_VERSION, parseDraftEnvelope, parseWorkshopDraft } from './draftSchema'

// A JSON copy, as the draft arrives from the file or the wire.
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function rejects(mutate: (draft: Record<string, unknown>) => void, message: RegExp) {
  const draft = viaJson(fullDraft({ published: true })) as unknown as Record<string, unknown>
  mutate(draft)
  const result = parseWorkshopDraft(draft)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.message).toMatch(message)
}

describe('working-draft validation: round trip', () => {
  it('restores an empty draft exactly', () => {
    expect(parseWorkshopDraft(viaJson(createInitialDraft()))).toEqual({ ok: true, value: createInitialDraft() })
  })

  it('restores every durable field of a full draft exactly', () => {
    const draft = fullDraft({ published: true })
    const parsed = parseWorkshopDraft(viaJson(draft))
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value).toEqual(draft)
    // Spot-check what matters most.
    expect(parsed.value.poolSource).toBe('sourced')
    expect(parsed.value.priorityWords).toEqual({ manual: ['KENNEL'], sourced: ['POODLE'] })
    expect(parsed.value.sourcing.pool?.candidates.find((c) => c.sourceAnswer === 'Beagle')?.included).toBe(false)
    expect(parsed.value.generationCount).toBe(3)
    expect(parsed.value.finalPuzzle?.number).toBe(2)
    expect(parsed.value.finalPuzzle?.inputs).toEqual({ id: 'dogs7', clue: 'Good dogs' })
    expect(parsed.value.finalPuzzle?.publication).toEqual(DEV_PUBLICATION)
    expect(parsed.value.savedCandidates.map((saved) => saved.fingerprint)).toEqual(
      dogsBatch().candidates.slice(0, 2).map(candidateFingerprint),
    )
    expect(parsed.value.savedCandidates[1].origin).toEqual({ batchSeed: 'workshop-generation-1', number: 2, clue: 'Dogs' })
  })

  it('drops unknown fields and recomputes candidate metrics from the construction', () => {
    const draft = viaJson(fullDraft()) as unknown as Record<string, unknown> & {
      finalPuzzle: { candidate: { metrics: Record<string, unknown> } }
    }
    draft.extra = 'ignored'
    const original = fullDraft().finalPuzzle!.candidate.metrics
    draft.finalPuzzle.candidate.metrics = { tampered: true }
    const parsed = parseWorkshopDraft(draft)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value).not.toHaveProperty('extra')
    expect(parsed.value.finalPuzzle?.candidate.metrics).toEqual(original)
  })
})

describe('working-draft validation: rejections', () => {
  it('rejects a non-object draft and bad top-level fields', () => {
    expect(parseWorkshopDraft('draft').ok).toBe(false)
    rejects((d) => (d.poolSource = 'both'), /draft\.poolSource must be one of/)
    rejects((d) => (d.clue = 7), /draft\.clue must be a string/)
    rejects((d) => (d.generationCount = -1), /draft\.generationCount must not be negative/)
    rejects((d) => (d.generationCount = 1.5), /draft\.generationCount must be an integer/)
  })

  it('rejects bad sourcing settings and reviewed pools', () => {
    rejects((d) => ((d.sourcing as Record<string, unknown>).sourceKind = 'cloud'), /sourceKind must be one of/)
    rejects((d) => {
      const pool = (d.sourcing as { pool: { candidates: Record<string, unknown>[] } }).pool
      pool.candidates[0].included = 'yes'
    }, /candidates\[0\]\.included must be true or false/)
    rejects((d) => {
      const pool = (d.sourcing as { pool: { candidates: Record<string, unknown>[] } }).pool
      pool.candidates[1].id = pool.candidates[0].id
    }, /duplicate ids/)
  })

  it('rejects Priority Words that are not construction form, repeated, or more than 10', () => {
    const priority = (d: Record<string, unknown>) => d.priorityWords as Record<string, unknown>
    rejects((d) => (priority(d).manual = ['kennel']), /priorityWords\.manual\[0\] is not a valid Priority Word/)
    rejects((d) => (priority(d).manual = ['KENNEL', 'KENNEL']), /duplicate words/)
    rejects((d) => (priority(d).sourced = 'POODLE'), /priorityWords\.sourced must be an array/)
    const eleven = ['BEAGLE', 'POODLE', 'COLLIE', 'CORGI', 'LEASH', 'COLLAR', 'FETCH', 'BARK', 'TREAT', 'KENNEL', 'PUPPY']
    rejects((d) => (priority(d).manual = eleven), /more than 10 words/)
  })

  it('rejects broken Final Puzzle candidates and inputs', () => {
    const final = (d: Record<string, unknown>) => d.finalPuzzle as Record<string, unknown> & { candidate: Record<string, unknown> }
    const construction = (d: Record<string, unknown>) => final(d).candidate.construction as Record<string, unknown>
    rejects((d) => (final(d).number = 0), /finalPuzzle\.number must be at least 1/)
    rejects((d) => ((final(d).inputs as Record<string, unknown>).id = null), /finalPuzzle\.inputs\.id must be a string/)
    rejects((d) => (construction(d).ok = false), /must be a successful construction/)
    rejects((d) => {
      const answers = construction(d).placedAnswers as { start: { x: number } }[]
      answers[0].start.x += 40
    }, /runs over a cell that isn't in the construction/)
    rejects((d) => {
      const positions = construction(d).positions as Record<string, unknown>
      delete positions[Object.keys(positions)[0]]
    }, /must describe the same cells/)
    rejects((d) => (final(d).candidate.selectedAnswers = ['NOPE']), /selectedAnswers must be the construction's answers/)
    rejects((d) => ((final(d).publication as Record<string, unknown>).kind = 'maybe'), /publication\.kind must be one of/)
    rejects(
      (d) => (((final(d).publication as Record<string, unknown>).publication as Record<string, unknown>).publishDate = 'soon'),
      /publishDate must be a YYYY-MM-DD date/,
    )
  })

  it('rejects broken Saved Candidates and a Final Puzzle that isn’t one of them', () => {
    const saved = (d: Record<string, unknown>) => d.savedCandidates as Record<string, unknown>[]
    rejects((d) => (d.savedCandidates = undefined), /savedCandidates must be an array/)
    rejects((d) => (saved(d)[0].fingerprint = 'v1;1x1;'), /savedCandidates\[0\]\.fingerprint doesn't match/)
    rejects((d) => saved(d).push(saved(d)[0]), /same layout saved twice/)
    rejects((d) => ((saved(d)[0].origin as Record<string, unknown>).number = 0), /origin\.number must be at least 1/)
    rejects((d) => ((saved(d)[0].candidate as Record<string, unknown>).answerCount = 99), /answerCount must match/)
    rejects((d) => saved(d).splice(1, 1), /finalPuzzle must be one of draft\.savedCandidates/)
  })

  it('keeps a saved candidate’s publication record once another candidate is approved, and checks it', () => {
    const published = fullDraft({ published: true })
    const moved = workshopReducer(
      { draft: published, session: createInitialSession() },
      { type: 'APPROVE_SAVED_CANDIDATE', id: published.savedCandidates[0].id },
    ).draft
    expect(moved.savedCandidates[1].publication).toEqual({ inputs: { id: 'dogs7', clue: 'Good dogs' }, published: DEV_PUBLICATION })
    expect(parseWorkshopDraft(viaJson(moved))).toEqual({ ok: true, value: moved })

    const draft = viaJson(moved) as unknown as Record<string, unknown>
    const saved = draft.savedCandidates as Record<string, unknown>[]
    delete saved[0].publication // written before records were kept: none
    const parsed = parseWorkshopDraft(draft)
    expect(parsed.ok && parsed.value.savedCandidates[0].publication).toBe(null)

    const rejectsMoved = (mutate: (saved: Record<string, unknown>[]) => void, message: RegExp) => {
      const copy = viaJson(moved) as unknown as Record<string, unknown>
      mutate(copy.savedCandidates as Record<string, unknown>[])
      const result = parseWorkshopDraft(copy)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toMatch(message)
    }
    rejectsMoved((s) => ((s[1].publication as Record<string, unknown>).inputs = { id: 7 }), /savedCandidates\[1\]\.publication\.inputs\.id must be a string/)
    rejectsMoved(
      (s) => (((s[1].publication as Record<string, unknown>).published as Record<string, unknown>).kind = 'maybe'),
      /savedCandidates\[1\]\.publication\.published\.kind must be one of/,
    )
    // The Final Puzzle's record is finalPuzzle.publication, never a second copy on its entry.
    rejectsMoved((s) => (s[0].publication = s[1].publication), /must not have its own publication/)
  })
})

describe('working-draft envelope', () => {
  it('accepts a current-version envelope with a positive integer revision', () => {
    const envelope = envelopeOf(fullDraft(), 8)
    expect(envelope.schemaVersion).toBe(3)
    expect(parseDraftEnvelope(viaJson(envelope))).toEqual({ ok: true, value: envelope })
  })

  it('migrates a version 1 draft, its Final Puzzle becoming the one Saved Candidate', () => {
    const current = fullDraft({ published: true })
    const parsed = parseDraftEnvelope(legacyEnvelopeOf(current, 5))
    if (!parsed.ok) throw new Error(parsed.message)
    const { draft } = parsed.value
    expect(parsed.value).toMatchObject({ schemaVersion: DRAFT_SCHEMA_VERSION, revision: 5 })
    // Everything else is kept exactly, including the Final Puzzle and its publication.
    expect({
      ...draft,
      savedCandidates: current.savedCandidates,
      finalPuzzle: { ...draft.finalPuzzle, savedId: current.finalPuzzle!.savedId },
    }).toEqual(current)
    expect(draft.savedCandidates).toEqual([
      {
        id: 'saved-1',
        name: null,
        fingerprint: candidateFingerprint(current.finalPuzzle!.candidate),
        candidate: current.finalPuzzle!.candidate,
        origin: { batchSeed: null, number: 2, clue: null },
        savedAt: null,
        publication: null,
        edit: null,
      },
    ])
    expect(draft.finalPuzzle?.savedId).toBe('saved-1')
    // Without a Final Puzzle there is nothing to save.
    const empty = parseDraftEnvelope(legacyEnvelopeOf(createInitialDraft()))
    expect(empty.ok && empty.value.draft.savedCandidates).toEqual([])
  })

  it('a version 1 draft that is broken stays unreadable rather than half-migrated', () => {
    const legacy = legacyEnvelopeOf(fullDraft()) as { draft: { finalPuzzle: { candidate: { construction: unknown } } } }
    legacy.draft.finalPuzzle.candidate.construction = { ok: false }
    expect(parseDraftEnvelope(legacy).ok).toBe(false)
  })

  it('rejects unsupported schema versions, bad revisions, and a missing draft', () => {
    const envelope = () => viaJson(envelopeOf(createInitialDraft())) as unknown as Record<string, unknown>
    const message = (value: unknown) => {
      const result = parseDraftEnvelope(value)
      return result.ok ? null : result.message
    }
    expect(message({ ...envelope(), schemaVersion: 4 })).toMatch(/Unsupported working-draft schema version 4/)
    expect(message({ ...envelope(), schemaVersion: 0 })).toMatch(/Unsupported working-draft schema version 0/)
    expect(message({ ...envelope(), schemaVersion: undefined })).toMatch(/Unsupported working-draft schema version;/)
    expect(message({ ...envelope(), revision: 0 })).toMatch(/revision must be at least 1/)
    expect(message({ ...envelope(), revision: '3' })).toMatch(/revision must be an integer/)
    expect(message({ ...envelope(), draft: undefined })).toMatch(/draft must be an object/)
    expect(message([])).toMatch(/envelope must be an object/)
  })
})
