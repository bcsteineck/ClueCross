import './ClueHeader.scss'

export interface ClueHeaderProps {
  clue: string
}

export function ClueHeader({ clue }: ClueHeaderProps) {
  return (
    <header className="clue-header">
      <h1 className="clue-header__text">
        Today’s Clue: <strong>{clue}</strong>
      </h1>
    </header>
  )
}
