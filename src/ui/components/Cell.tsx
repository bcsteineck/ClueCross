import type { KeyboardEvent } from 'react'
import type { CellId } from '../../core/types'
import type { Position } from '../../layout/types'
import './Cell.scss'

export interface CellProps {
  cellId: CellId
  position: Position
  value: string
  isLocked: boolean
  /** The remembered active cell (roving tabindex). */
  isActive: boolean
  /** Shown as the active input target: active AND the board currently has focus. */
  showActive: boolean
  isComplete: boolean
  isImpossible: boolean
  onActivate: (cellId: CellId) => void
  onPointerDownCell: (cellId: CellId) => void
  onClickActivate: (cellId: CellId) => void
  onChangeValue: (cellId: CellId, rawValue: string) => void
  onKeyDownCell: (cellId: CellId, event: KeyboardEvent<HTMLInputElement>) => void
  inputRef: (cellId: CellId, element: HTMLInputElement | null) => void
}

function collapseSelection(input: HTMLInputElement) {
  const end = input.value.length
  if (input.selectionStart !== end || input.selectionEnd !== end) {
    input.setSelectionRange(end, end)
  }
}

export function Cell({
  cellId,
  position,
  value,
  isLocked,
  isActive,
  showActive,
  isComplete,
  isImpossible,
  onActivate,
  onPointerDownCell,
  onClickActivate,
  onChangeValue,
  onKeyDownCell,
  inputRef,
}: CellProps) {
  const accessibleLabel = isComplete
    ? `Completed, letter ${value || 'blank'}`
    : isLocked
      ? `Locked, letter ${value || 'blank'}`
    : value
      ? `Editable, letter ${value} entered`
      : 'Editable, empty'

  const className = [
    'cell',
    isLocked && 'cell--locked',
    showActive && 'cell--active',
    isComplete && 'cell--complete',
    isImpossible && 'cell--impossible',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className="cell-tile"
      style={{
        gridColumn: position.x + 1,
        gridRow: position.y + 1,
      }}
    >
      {/* Invisible on purpose — Safari (especially iOS) sometimes doesn't
          repaint an <input>'s own text when its value changes while it isn't
          the focused element (auto-advancing after typing, or a reveal
          setting a cell that was never focused, both do this). The visible
          letter below is a plain span driven by ordinary React rendering,
          which sidesteps that bug entirely; this input only ever handles
          focus, caret, and keystrokes. */}
      <input
        ref={(el) => inputRef(cellId, el)}
        type="text"
        id={`cell-${cellId}`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        // 2, not 1: an input-event-only keyboard typing into a filled cell
        // must be able to insert the new letter beside the old one, which
        // PuzzleBoard then normalizes to just the new letter.
        maxLength={2}
        value={value}
        readOnly={isLocked}
        // A completed puzzle is a finished, read-only result: its cells
        // leave the tab order and can't take focus or show the editing
        // state, while staying in the accessibility tree with their letters.
        disabled={isComplete}
        tabIndex={isActive && !isComplete ? 0 : -1}
        aria-label={accessibleLabel}
        data-testid={`cell-${cellId}`}
        className={className}
        // Replacement never depends on a text selection (PuzzleBoard replaces
        // on keydown and normalizes input events), so focus and taps only
        // ever leave a collapsed caret: some mobile browsers (iPhone Chrome)
        // paint a native highlight over selected text that CSS can't hide.
        onFocus={(event) => {
          onActivate(cellId)
          collapseSelection(event.target)
        }}
        onMouseDown={() => onPointerDownCell(cellId)}
        onClick={(event) => {
          onClickActivate(cellId)
          collapseSelection(event.currentTarget)
        }}
        onChange={(event) => onChangeValue(cellId, event.target.value)}
        onKeyDown={(event) => onKeyDownCell(cellId, event)}
      />
      <span className="cell__letter" aria-hidden="true">
        {value}
      </span>
      {/* The active-cell background wash alone reads as too subtle a
          selection cue — this reinforces it, but only while there's
          nothing else (a letter) already marking the cell. */}
      {showActive && !value && <span className="cell__dot" aria-hidden="true" />}
    </div>
  )
}
