import type { KeyboardEvent } from 'react'
import type { CellId } from '../../core/types'
import type { Position } from '../../layout/types'
import './Cell.scss'

export interface CellProps {
  cellId: CellId
  position: Position
  value: string
  isLocked: boolean
  isActive: boolean
  isComplete: boolean
  isImpossible: boolean
  onActivate: (cellId: CellId) => void
  onPointerDownCell: (cellId: CellId) => void
  onClickActivate: (cellId: CellId) => void
  onChangeValue: (cellId: CellId, rawValue: string) => void
  onKeyDownCell: (cellId: CellId, event: KeyboardEvent<HTMLInputElement>) => void
  inputRef: (cellId: CellId, element: HTMLInputElement | null) => void
}

export function Cell({
  cellId,
  position,
  value,
  isLocked,
  isActive,
  isComplete,
  isImpossible,
  onActivate,
  onPointerDownCell,
  onClickActivate,
  onChangeValue,
  onKeyDownCell,
  inputRef,
}: CellProps) {
  const accessibleLabel = isLocked
    ? `Locked, letter ${value || 'blank'}`
    : value
      ? `Editable, letter ${value} entered`
      : 'Editable, empty'

  const className = [
    'cell',
    isLocked && 'cell--locked',
    isActive && 'cell--active',
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
        inputMode="none"
        maxLength={1}
        value={value}
        readOnly={isLocked}
        tabIndex={isActive ? 0 : -1}
        aria-label={accessibleLabel}
        data-testid={`cell-${cellId}`}
        className={className}
        onFocus={(event) => {
          onActivate(cellId)
          if (!isLocked) {
            event.target.select()
          }
        }}
        onMouseDown={() => onPointerDownCell(cellId)}
        onClick={() => onClickActivate(cellId)}
        onChange={(event) => onChangeValue(cellId, event.target.value)}
        onKeyDown={(event) => onKeyDownCell(cellId, event)}
      />
      <span className="cell__letter" aria-hidden="true">
        {value}
      </span>
    </div>
  )
}
