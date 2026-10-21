/** What Author and Candidates need to offer the shared Generate control (WorkshopApp owns the behavior). */
export interface GenerateProps {
  canGenerate: boolean
  onGenerate: () => void
  confirm: { finalPuzzleLabel: string; published: boolean } | null
  onConfirm: () => void
  onCancel: () => void
}
