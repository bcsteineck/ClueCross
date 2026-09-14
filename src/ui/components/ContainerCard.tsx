import type { HTMLAttributes, ReactNode } from 'react'
import './ContainerCard.scss'

export interface ContainerCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'shadow'
  children: ReactNode
}

// The Figma "Container Card" component — the shared shell behind every
// dashboard card (Clue, Score, Progress, Reveal History, How It Works) and
// the desktop header/center-column content area.
export function ContainerCard({
  variant = 'default',
  className,
  children,
  ...rest
}: ContainerCardProps) {
  const classes = ['container-card', `container-card--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
