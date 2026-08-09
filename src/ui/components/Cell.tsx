import { useEffect, useRef } from 'react'
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
  const elementRef = useRef<HTMLInputElement | null>(null)
  const isFirstRender = useRef(true)

  // Safari (especially iOS) sometimes doesn't repaint an <input>'s text when
  // its value is changed programmatically while it isn't the focused element
  // — which is exactly what happens when typing auto-advances focus to the
  // next cell, or a reveal sets a cell's letter from the Alphabet Keyboard.
  // Forcing a reflow after such an update works around it.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const el = elementRef.current
    if (!el || el === document.activeElement) return
    const display = el.style.display
    el.style.display = 'none'
    void el.offsetHeight
    el.style.display = display
  }, [value])

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
    <input
      ref={(el) => {
        elementRef.current = el
        inputRef(cellId, el)
      }}
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
      style={{
        gridColumn: position.x + 1,
        gridRow: position.y + 1,
      }}
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
  )
}
