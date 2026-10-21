// Shape validation of an untrusted construction (a generated layout): the
// fields Final Puzzle preparation reads, rebuilt into a clean copy so
// unknown fields are dropped. Shared by the server's publish-request parser
// and the working-draft validator. Whether the layout is a valid puzzle is
// decided afterward by the Final Puzzle validation, not here.

import type { ConstructionSuccess, PlacedAnswer, Position } from '../../../tools/generator/src/types.js'

// Keys that would alter an object's prototype if copied by assignment.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** A shape problem, with a message that names the offending path. */
export class ShapeError extends Error {}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ShapeError(`${path} must be an object.`)
  return value
}

export function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new ShapeError(`${path} must be a string.`)
  return value
}

export function requireInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ShapeError(`${path} must be an integer.`)
  return value
}

export function requireKey(key: string, path: string): string {
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

export function parseConstruction(value: unknown, path = 'construction'): ConstructionSuccess {
  const record = requireRecord(value, path)
  if (record.ok !== true) throw new ShapeError(`${path} must be a successful construction.`)
  if (!Array.isArray(record.placedAnswers)) throw new ShapeError(`${path}.placedAnswers must be an array.`)

  const cells: Record<string, string> = {}
  for (const [key, letter] of Object.entries(requireRecord(record.cells, `${path}.cells`))) {
    cells[requireKey(key, `${path}.cells`)] = requireString(letter, `${path}.cells.${key}`)
  }
  const positions: Record<string, Position> = {}
  for (const [key, position] of Object.entries(requireRecord(record.positions, `${path}.positions`))) {
    positions[requireKey(key, `${path}.positions`)] = parsePosition(position, `${path}.positions.${key}`)
  }

  return {
    ok: true,
    placedAnswers: record.placedAnswers.map((answer, index) => parsePlacedAnswer(answer, `${path}.placedAnswers[${index}]`)),
    cells,
    positions,
    width: requireInteger(record.width, `${path}.width`),
    height: requireInteger(record.height, `${path}.height`),
    attemptsUsed: requireInteger(record.attemptsUsed, `${path}.attemptsUsed`),
  }
}
