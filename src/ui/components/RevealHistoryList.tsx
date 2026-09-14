import { useState } from 'react'
import type { RevealHistoryEntry } from '../../core/types'
import { Button } from './Button'
import './RevealHistoryList.scss'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface RevealHistoryListProps {
  entries: RevealHistoryEntry[]
}

const COLLAPSED_COUNT = 3

// Entries are already newest-first (see core/gameEngine.ts revealLetter),
// so no sorting happens here — just how many of them are shown.
export function RevealHistoryList({ entries }: RevealHistoryListProps) {
  const [expanded, setExpanded] = useState(false)

  if (entries.length === 0) {
    return <p className="reveal-history__empty">No letters revealed yet.</p>
  }

  const visibleEntries = expanded ? entries : entries.slice(0, COLLAPSED_COUNT)
  const toggleLabel = expanded ? 'Show Less' : 'Show All'
  const ToggleIcon = expanded ? ChevronUp : ChevronDown

  return (
    <div className="reveal-history">
      <ul className="reveal-history__list">
        {visibleEntries.map((entry) => (
          <li key={entry.letter} className="reveal-history__row">
            <span className="reveal-history__avatar" aria-hidden="true">
              {entry.letter}
            </span>
            <span className="reveal-history__cost">{entry.cost}</span>
            <span className="reveal-history__cells">
              {entry.cellsRevealed} {entry.cellsRevealed === 1 ? 'cell' : 'cells'}
            </span>
          </li>
        ))}
      </ul>
      {entries.length > COLLAPSED_COUNT && (
        <Button variant="text" onClick={() => setExpanded((current) => !current)}>
          {toggleLabel}
          <ToggleIcon size={20} aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
