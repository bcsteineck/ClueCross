import type { RevealHistoryEntry } from '../../core/types'
import { ContainerCard } from './ContainerCard'
import { RevealHistoryList } from './RevealHistoryList'

export interface RevealHistoryCardProps {
  entries: RevealHistoryEntry[]
}

export function RevealHistoryCard({ entries }: RevealHistoryCardProps) {
  return (
    <ContainerCard className="reveal-history-card">
      <h2 className="container-card__title">Reveal History</h2>
      <RevealHistoryList entries={entries} />
    </ContainerCard>
  )
}
