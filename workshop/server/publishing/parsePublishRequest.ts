// Shape validation of an untrusted publish/preview request body. It checks
// only structure — that `construction`, `id`, and `clue` have the types the
// Final Puzzle preparation expects — and rebuilds a clean copy, so unknown
// fields (including any browser-assembled `puzzle`/`layout`) are dropped and
// never reach assembly. Whether the content is a valid puzzle is decided
// afterward by the existing Final Puzzle validation, not here.

import type { ConstructionSuccess, PlacedAnswer, Position } from '../../../tools/generator/src/types.js'
import type { PublishRequest } from '../../src/publishing/contract'

export type ParsePublishRequestResult = { ok: true; request: PublishRequest } | { ok: false; message: string }

// Keys that would alter an object's prototype if copied by assignment.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

class ShapeError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ShapeError(`${path} must be an object.`)
  return value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new ShapeError(`${path} must be a string.`)
  return value
}

function requireInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ShapeError(`${path} must be an integer.`)
  return value
}

function requireKey(key: string, path: string): string {
  if (key === '' || UNSAFE_KEYS.has(key)) throw new ShapeError(`${path} has an invalid key.`)
  return key
}

function parsePosition(value: unknown, path: string): Position {
  const record = requireRecord(value, path)
  return { x: requireInteger(record.x, `${path}.x`), y: requireInteger(record.y, `${path}.y`) }
}

function parsePlacedAnswer(value: unknown, path: string): PlacedAnswer {
  const record = requireRecord(value, path)
  const direction = record.direction
  if (direction !== 'across' && direction !== 'down') throw new ShapeError(`${path}.direction must be "across" or "down".`)
  return { word: requireString(record.word, `${path}.word`), direction, start: parsePosition(record.start, `${path}.start`) }
}

function parseConstruction(value: unknown): ConstructionSuccess {
  const record = requireRecord(value, 'construction')
  if (record.ok !== true) throw new ShapeError('construction must be a successful construction.')
  if (!Array.isArray(record.placedAnswers)) throw new ShapeError('construction.placedAnswers must be an array.')

  const cells: Record<string, string> = {}
  for (const [key, letter] of Object.entries(requireRecord(record.cells, 'construction.cells'))) {
    cells[requireKey(key, 'construction.cells')] = requireString(letter, `construction.cells.${key}`)
  }
  const positions: Record<string, Position> = {}
  for (const [key, position] of Object.entries(requireRecord(record.positions, 'construction.positions'))) {
    positions[requireKey(key, 'construction.positions')] = parsePosition(position, `construction.positions.${key}`)
  }

  return {
    ok: true,
    placedAnswers: record.placedAnswers.map((answer, index) =>
      parsePlacedAnswer(answer, `construction.placedAnswers[${index}]`),
    ),
    cells,
    positions,
    width: requireInteger(record.width, 'construction.width'),
    height: requireInteger(record.height, 'construction.height'),
    attemptsUsed: requireInteger(record.attemptsUsed, 'construction.attemptsUsed'),
  }
}

export function parsePublishRequest(body: unknown): ParsePublishRequestResult {
  try {
    const record = requireRecord(body, 'Request body')
    return {
      ok: true,
      request: {
        construction: parseConstruction(record.construction),
        id: requireString(record.id, 'id'),
        clue: requireString(record.clue, 'clue'),
      },
    }
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, message: error.message }
    throw error
  }
}
