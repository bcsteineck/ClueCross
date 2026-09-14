import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { ContainerCard } from './ContainerCard'
import './HowItWorksCard.scss'

// Concise contextual guidance (spec section 19) — desktop's only path to
// instructions, since the desktop header has no How-to-Play trigger and
// this card doesn't link out to anything deeper.
const COPY =
  'Reveal letters to uncover words across the board or type them in yourself. Use your budget wisely to earn the best score!'

export function HowItWorksCard() {
  const [expanded, setExpanded] = useState(true)

  return (
    <ContainerCard className="how-it-works-card">
      <button
        type="button"
        className="how-it-works-card__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <h2 className="container-card__title how-it-works-card__title">How It Works</h2>
        {expanded ? (
          <ChevronUp size={20} aria-hidden="true" />
        ) : (
          <ChevronDown size={20} aria-hidden="true" />
        )}
      </button>
      {expanded && <p className="how-it-works-card__body">{COPY}</p>}
    </ContainerCard>
  )
}
