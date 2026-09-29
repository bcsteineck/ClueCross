import type { CSSProperties } from 'react'
import type { ConstructionSuccess } from '../../tools/generator/src/types.js'

// Read-only preview of generated geometry. Deliberately NOT the player
// PuzzleBoard: that component needs a full PuzzleDefinition/LayoutDefinition
// plus gameplay state (values, active cell, reveal locks, input handlers),
// none of which exist for an unpublished candidate. This renders only the
// occupied cells, positioned on the candidate's own bounding grid, fitted
// into a square frame so every preview shares one consistent area.

interface CandidateBoardProps {
  construction: ConstructionSuccess
  /** Text alternative for the whole board; omit when the board is decorative (its details are already given as text nearby). */
  label?: string
}

export function CandidateBoard({ construction, label }: CandidateBoardProps) {
  const { width, height, cells, positions } = construction
  const boardStyle = {
    '--cols': width,
    '--rows': height,
    '--max': Math.max(width, height),
  } as CSSProperties

  return (
    <div
      className="ws-board"
      style={boardStyle}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <div className="ws-board__grid">
        {Object.entries(cells).map(([cellId, letter]) => (
          <span
            key={cellId}
            className="ws-board__cell"
            style={{ '--x': positions[cellId].x + 1, '--y': positions[cellId].y + 1 } as CSSProperties}
          >
            {letter}
          </span>
        ))}
      </div>
    </div>
  )
}
