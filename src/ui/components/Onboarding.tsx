import type { KeyboardEvent, MouseEvent, TouchEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './Button'
import './Onboarding.scss'

export interface OnboardingProps {
  onClose: () => void
}

interface OnboardingCard {
  image: string
  title: string
  // Each paragraph rendered separately, matching the source copy's own
  // paragraph breaks — keeps every card to short, scannable chunks.
  body: string[]
}

const CARDS: OnboardingCard[] = [
  {
    image: '/images/onboarding/PageHeaderPuzzleClue.svg',
    title: 'One Clue. Many Words.',
    body: [
      'Every puzzle is built around a single clue.',
      'Use the clue to figure out all of the connected words in the grid. Every word relates to the same clue, and crossing letters help you solve the rest.',
    ],
  },
  {
    image: '/images/onboarding/PuzzleCells.svg',
    title: 'Complete the Puzzle',
    body: [
      'Type letters into empty cells to solve the words.',
      'You can work in any order, erase mistakes, and change your guesses until every cell is correct.',
    ],
  },
  {
    image: '/images/onboarding/BuyALetter.svg',
    title: 'Need a Hint? Buy a Letter',
    body: [
      'Spend points to reveal every instance of a letter in the puzzle. The fewer letters you buy, the higher your final score.',
    ],
  },
  {
    image: '/images/onboarding/ArchiveCalendar.svg',
    title: 'Explore the Archive',
    body: [
      'Missed a day?',
      'Visit the Archive anytime to play previous ClueCross puzzles and improve your best scores.',
    ],
  },
]

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Minimum horizontal drag, in pixels, before a touch gesture counts as a
// swipe rather than an incidental tap/scroll wobble.
const SWIPE_THRESHOLD = 50

// Same centered dialog + blurred/locked backdrop as ResultModal, reused
// here — opened once on first-ever visit, and afterwards on demand from
// the "How to Play" button.
export function Onboarding({ onClose }: OnboardingProps) {
  const [index, setIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const titleId = useId()

  const isFirst = index === 0
  const isLast = index === CARDS.length - 1
  const card = CARDS[index]

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  function handleBack() {
    setIndex((current) => Math.max(0, current - 1))
  }

  function handleNext() {
    if (isLast) {
      onClose()
      return
    }
    setIndex((current) => Math.min(CARDS.length - 1, current + 1))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key === 'ArrowRight') {
      handleNext()
      return
    }
    if (event.key === 'ArrowLeft' && !isFirst) {
      handleBack()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    )
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return

    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return

    if (dx < 0) {
      handleNext()
    } else if (!isFirst) {
      handleBack()
    }
  }

  return (
    <div className="onboarding__overlay" onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className="onboarding"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="onboarding__header">
          <Button variant="text" onClick={onClose}>
            Skip
          </Button>
        </div>

        <div
          key={index}
          className="onboarding__card"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <img className="onboarding__image" src={card.image} alt="" />
          <h2 id={titleId} className="onboarding__title">
            {card.title}
          </h2>
          {card.body.map((paragraph) => (
            <p key={paragraph} className="onboarding__body">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="onboarding__footer">
          <Button variant="text" onClick={handleBack} disabled={isFirst}>
            Back
          </Button>
          <div className="onboarding__dots" aria-hidden="true">
            {CARDS.map((dotCard, dotIndex) => (
              <span
                key={dotCard.title}
                className={`onboarding__dot${dotIndex === index ? ' onboarding__dot--active' : ''}`}
              />
            ))}
          </div>
          <Button onClick={handleNext}>{isLast ? 'Start Playing' : 'Next'}</Button>
        </div>
      </div>
    </div>
  )
}
