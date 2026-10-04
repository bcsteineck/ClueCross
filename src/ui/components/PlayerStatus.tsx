import { Button } from './Button'
import { ContainerCard } from './ContainerCard'
import './PlayerStatus.scss'

export interface PlayerStatusProps {
  kind: 'loading' | 'error' | 'empty'
  onRetry?: () => void
}

const MESSAGES: Record<PlayerStatusProps['kind'], { title: string; detail: string }> = {
  loading: { title: 'Loading today’s puzzle…', detail: '' },
  error: { title: 'The puzzle couldn’t be loaded.', detail: 'Check your connection and try again.' },
  empty: { title: 'No puzzle is available yet.', detail: 'Check back soon for the first ClueCross puzzle.' },
}

// The minimal app-level states before a puzzle exists to play: loading the
// released calendar, a failed load (with Retry), or a calendar with nothing
// released yet. Never falls back to a bundled puzzle.
export function PlayerStatus({ kind, onRetry }: PlayerStatusProps) {
  const { title, detail } = MESSAGES[kind]
  return (
    <main className="player-status">
      <img src="/images/logo/cc_logo.svg" alt="ClueCross" className="player-status__logo" />
      <ContainerCard className="player-status__card" role={kind === 'error' ? 'alert' : 'status'}>
        <p className="player-status__title">{title}</p>
        {detail && <p className="player-status__detail">{detail}</p>}
        {kind === 'error' && onRetry && <Button onClick={onRetry}>Retry</Button>}
      </ContainerCard>
    </main>
  )
}
