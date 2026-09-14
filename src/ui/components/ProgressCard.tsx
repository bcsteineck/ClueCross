import type { ProgressSummary } from '../../core/progress'
import { ContainerCard } from './ContainerCard'
import { ProgressBar } from './ProgressBar'

export interface ProgressCardProps {
  progress: ProgressSummary
}

export function ProgressCard({ progress }: ProgressCardProps) {
  return (
    <ContainerCard className="progress-card">
      <h2 className="container-card__title">Progress</h2>
      <ProgressBar progress={progress} />
    </ContainerCard>
  )
}
