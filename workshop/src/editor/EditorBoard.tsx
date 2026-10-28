import { useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { EDITOR_GRID_SIZE, cellName, numberWords, wordCells } from './editorLayout'
import type { EditorWord, Placement, PlacementCheck } from './editorLayout'

// The Editor's 12×12 board. Interactive, it is an ARIA grid of cell
// buttons with one tab stop (arrow keys, Home/End move; Enter or Space
// clicks); read-only (View Original, the mobile view), it is one labelled
// image. Every state that matters is in text as well as color: each cell's
// name says what it holds, whether it's in the selected word, whether it's
// a suggested start, and — while placing — whether the word would fit there.

export interface BoardPlacement {
  placement: Omit<Placement, 'start'>
  /** The check for each starting cell ("x,y"); missing means not checked. */
  checks: Map<string, PlacementCheck>
  /** Suggested (connected) starting cells. */
  suggested: Set<string>
  /** The word being moved: its current cells are shown as where it comes from. */
  movingId: string | null
}

interface EditorBoardProps {
  words: readonly EditorWord[]
  label: string
  interactive: boolean
  selectedId?: string | null
  placing?: BoardPlacement | null
  /** The start being previewed (hover or focus while placing). */
  preview?: { x: number; y: number } | null
  onCellClick?: (x: number, y: number) => void
  onPreview?: (cell: { x: number; y: number } | null) => void
}

const key = (x: number, y: number) => `${x},${y}`
const CELLS = Array.from({ length: EDITOR_GRID_SIZE * EDITOR_GRID_SIZE }, (_, index) => ({
  x: index % EDITOR_GRID_SIZE,
  y: Math.floor(index / EDITOR_GRID_SIZE),
}))

export function EditorBoard({
  words,
  label,
  interactive,
  selectedId = null,
  placing = null,
  preview = null,
  onCellClick,
  onPreview,
}: EditorBoardProps) {
  const [focusCell, setFocusCell] = useState({ x: 0, y: 0 })
  const gridRef = useRef<HTMLDivElement>(null)

  const letters = new Map<string, string>()
  const selectedCells = new Set<string>()
  const movingCells = new Set<string>()
  for (const word of words) {
    for (const cell of wordCells(word)) {
      letters.set(key(cell.x, cell.y), cell.letter)
      if (word.id === selectedId) selectedCells.add(key(cell.x, cell.y))
      if (word.id === placing?.movingId) movingCells.add(key(cell.x, cell.y))
    }
  }
  const numbers = numberWords(words)
  const numberAt = new Map(words.map((word) => [key(word.start.x, word.start.y), numbers.get(word.id)]))

  const previewCheck = placing && preview ? placing.checks.get(key(preview.x, preview.y)) : undefined
  const previewCells = new Map<string, string>()
  if (placing && preview) {
    for (const cell of wordCells({ ...placing.placement, start: preview })) previewCells.set(key(cell.x, cell.y), cell.letter)
  }
  const previewValid = previewCheck?.ok ?? false

  function moveFocus(x: number, y: number) {
    const next = { x: Math.min(Math.max(x, 0), EDITOR_GRID_SIZE - 1), y: Math.min(Math.max(y, 0), EDITOR_GRID_SIZE - 1) }
    setFocusCell(next)
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${key(next.x, next.y)}"]`)?.focus()
  }

  function handleKeyDown(event: KeyboardEvent, x: number, y: number) {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [x + 1, y],
      ArrowLeft: [x - 1, y],
      ArrowDown: [x, y + 1],
      ArrowUp: [x, y - 1],
      Home: [0, y],
      End: [EDITOR_GRID_SIZE - 1, y],
    }
    const target = moves[event.key]
    if (!target) return
    event.preventDefault()
    moveFocus(...target)
  }

  function describe(x: number, y: number): string {
    const parts = [cellName(x, y)]
    const letter = letters.get(key(x, y))
    parts.push(letter ?? 'empty')
    const number = numberAt.get(key(x, y))
    if (number) parts.push(`number ${number}`)
    if (selectedCells.has(key(x, y))) parts.push('in the selected word')
    if (placing) {
      const check = placing.checks.get(key(x, y))
      const word = `${placing.placement.word} ${placing.placement.direction === 'across' ? 'Across' : 'Down'}`
      if (placing.suggested.has(key(x, y))) parts.push('suggested start')
      if (check?.ok) parts.push(`${word} fits starting here, crossing ${check.crossings} ${check.crossings === 1 ? 'letter' : 'letters'}`)
      else parts.push(`${word} can’t start here`)
    }
    return parts.join(', ')
  }

  const style = { '--size': EDITOR_GRID_SIZE } as CSSProperties

  if (!interactive) {
    return (
      <div className="ws-editor-board" style={style} role="img" aria-label={label}>
        <div className="ws-editor-board__grid" aria-hidden="true">
          {CELLS.map(({ x, y }) => {
            const letter = letters.get(key(x, y))
            return (
              <span key={key(x, y)} className={letter ? 'ws-editor-board__cell ws-editor-board__cell--filled' : 'ws-editor-board__cell'}>
                {numberAt.get(key(x, y)) && <span className="ws-editor-board__number">{numberAt.get(key(x, y))}</span>}
                {letter}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="ws-editor-board" style={style}>
      <div
        className="ws-editor-board__grid"
        role="grid"
        aria-label={label}
        ref={gridRef}
        onMouseLeave={() => onPreview?.(null)}
      >
        {Array.from({ length: EDITOR_GRID_SIZE }, (_, y) => (
          <div role="row" key={y} className="ws-editor-board__row">
            {Array.from({ length: EDITOR_GRID_SIZE }, (_, x) => {
              const cellKey = key(x, y)
              const letter = letters.get(cellKey)
              const previewLetter = previewCells.get(cellKey)
              const classes = [
                'ws-editor-board__cell',
                letter && 'ws-editor-board__cell--filled',
                selectedCells.has(cellKey) && 'ws-editor-board__cell--selected',
                movingCells.has(cellKey) && 'ws-editor-board__cell--moving',
                placing?.suggested.has(cellKey) && 'ws-editor-board__cell--suggested',
                previewLetter && (previewValid ? 'ws-editor-board__cell--preview' : 'ws-editor-board__cell--preview-invalid'),
              ]
              const shown = previewLetter && !letter ? previewLetter : letter
              return (
                <div role="gridcell" key={cellKey} aria-selected={selectedCells.has(cellKey)}>
                  <button
                    type="button"
                    className={classes.filter(Boolean).join(' ')}
                    data-cell={cellKey}
                    tabIndex={focusCell.x === x && focusCell.y === y ? 0 : -1}
                    aria-label={describe(x, y)}
                    onClick={() => {
                      setFocusCell({ x, y })
                      onCellClick?.(x, y)
                    }}
                    onKeyDown={(event) => handleKeyDown(event, x, y)}
                    onMouseEnter={() => placing && onPreview?.({ x, y })}
                    onFocus={() => placing && onPreview?.({ x, y })}
                  >
                    {numberAt.get(cellKey) && (
                      <span className="ws-editor-board__number" aria-hidden="true">
                        {numberAt.get(cellKey)}
                      </span>
                    )}
                    <span aria-hidden="true">{shown}</span>
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
