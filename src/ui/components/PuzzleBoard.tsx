import { useEffect, useImperativeHandle, useRef } from 'react'
import type { KeyboardEvent, Ref } from 'react'
import type { CellId, PuzzleDefinition } from '../../core/types'
import { getAvailableDirectionsForCell } from '../../layout/entryDirection'
import type { Direction } from '../../layout/entryDirection'
import { getCellsInDirection } from '../../layout/spatialNavigation'
import type { ArrowDirection } from '../../layout/spatialNavigation'
import type { LayoutDefinition } from '../../layout/types'
import { Cell } from './Cell'
import './PuzzleBoard.scss'

export interface PuzzleBoardProps {
  puzzle: PuzzleDefinition
  layout: LayoutDefinition
  values: Record<CellId, string>
  lockedCellIds: Record<CellId, true>
  isComplete: boolean
  activeCellId: CellId | null
  activeDirection: Direction
  onSetCellValue: (cellId: CellId, value: string) => void
  onActiveCellChange: (cellId: CellId) => void
  onActiveDirectionChange: (direction: Direction) => void
  ref?: Ref<PuzzleBoardHandle>
}

// Lets input sources outside the board (e.g. an on-screen keyboard) drive
// the same active-cell entry as typing directly into a cell's input.
export interface PuzzleBoardHandle {
  typeLetter: (letter: string) => void
  backspace: () => void
}

const ARROW_KEYS: Record<string, ArrowDirection> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export function PuzzleBoard({
  puzzle,
  layout,
  values,
  lockedCellIds,
  isComplete,
  activeCellId,
  activeDirection,
  onSetCellValue,
  onActiveCellChange,
  onActiveDirectionChange,
  ref,
}: PuzzleBoardProps) {
  const inputRefs = useRef<Record<CellId, HTMLInputElement | null>>({})

  // Mirrors activeCellId in a ref so a mousedown handler (which fires
  // before the resulting focus event) can tell whether the clicked cell
  // was already active — a React-state comparison inside the click
  // handler can't reliably do this, since focus's state update may
  // already have committed by the time click runs.
  const activeCellIdRef = useRef(activeCellId)
  useEffect(() => {
    activeCellIdRef.current = activeCellId
  }, [activeCellId])
  const clickTargetWasActiveRef = useRef(false)

  const effectiveActiveCellId = activeCellId ?? layout.navigationOrder[0] ?? null

  function focusCell(cellId: CellId) {
    inputRefs.current[cellId]?.focus()
  }

  function handlePointerDownCell(cellId: CellId) {
    clickTargetWasActiveRef.current = cellId === activeCellIdRef.current
  }

  function activateCell(cellId: CellId, options: { allowToggle: boolean }) {
    if (options.allowToggle) {
      const directions = getAvailableDirectionsForCell(puzzle, layout, cellId)
      if (directions.length === 2) {
        onActiveDirectionChange(activeDirection === 'across' ? 'down' : 'across')
      }
      return
    }
    onActiveCellChange(cellId)
    const directions = getAvailableDirectionsForCell(puzzle, layout, cellId)
    if (directions.length === 1) {
      onActiveDirectionChange(directions[0])
    }
  }

  function handleChangeValue(cellId: CellId, rawValue: string) {
    const letter = rawValue.slice(-1).toUpperCase()
    onSetCellValue(cellId, letter)
    if (letter) {
      const forward: ArrowDirection = activeDirection === 'across' ? 'right' : 'down'
      const next = getCellsInDirection(layout, cellId, forward).find(
        (id) => !lockedCellIds[id],
      )
      if (next) {
        focusCell(next)
      }
    }
  }

  function handleBackspace(cellId: CellId) {
    if (lockedCellIds[cellId]) return

    if (values[cellId]) {
      onSetCellValue(cellId, '')
      return
    }

    const backward: ArrowDirection = activeDirection === 'across' ? 'left' : 'up'
    const previous = getCellsInDirection(layout, cellId, backward).find(
      (id) => !lockedCellIds[id],
    )
    if (previous) {
      onSetCellValue(previous, '')
      focusCell(previous)
    }
  }

  function handleKeyDownCell(cellId: CellId, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key in ARROW_KEYS) {
      event.preventDefault()
      // Always the nearest cell, locked or not — landing on a mid-line
      // locked cell and a locked corner cell (the only path through to a
      // perpendicular entry) should behave the same way, rather than
      // skipping one but not the other. The locked visual styling already
      // shows it's non-editable.
      const [nearest] = getCellsInDirection(layout, cellId, ARROW_KEYS[event.key])
      if (nearest) {
        focusCell(nearest)
      }
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      handleBackspace(cellId)
    }
  }

  useImperativeHandle(ref, () => ({
    typeLetter(letter) {
      if (!effectiveActiveCellId || lockedCellIds[effectiveActiveCellId]) return
      handleChangeValue(effectiveActiveCellId, letter)
    },
    backspace() {
      if (!effectiveActiveCellId) return
      handleBackspace(effectiveActiveCellId)
    },
  }))

  return (
    <div className="puzzle-board">
      <div role="group" aria-label="Puzzle board" className="puzzle-board__grid">
        {Object.keys(puzzle.cells).map((cellId) => (
          <Cell
            key={cellId}
            cellId={cellId}
            position={layout.cellPositions[cellId]}
            value={values[cellId] ?? ''}
            isLocked={!!lockedCellIds[cellId]}
            isActive={cellId === effectiveActiveCellId}
            isComplete={isComplete}
            onActivate={(id) => activateCell(id, { allowToggle: false })}
            onPointerDownCell={handlePointerDownCell}
            onClickActivate={(id) =>
              activateCell(id, { allowToggle: clickTargetWasActiveRef.current })
            }
            onChangeValue={handleChangeValue}
            onKeyDownCell={handleKeyDownCell}
            inputRef={(id, el) => {
              inputRefs.current[id] = el
            }}
          />
        ))}
      </div>
    </div>
  )
}
