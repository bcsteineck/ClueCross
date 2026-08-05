import { Archive, Settings } from 'lucide-react'
import { Button } from './Button'
import './Header.scss'

export interface HeaderProps {
  archiveActive?: boolean
  onArchiveClick?: () => void
  settingsActive?: boolean
  onSettingsClick?: () => void
}

export function Header({
  archiveActive,
  onArchiveClick,
  settingsActive,
  onSettingsClick,
}: HeaderProps) {
  return (
    <div className="header">
      <div className="header__logo">ClueCross</div>
      <div className="header__options">
        <Button
          variant="text"
          active={archiveActive}
          iconRight={<Archive size={20} aria-hidden="true" />}
          onClick={onArchiveClick}
        >
          Archive
        </Button>
        <Button
          variant="text"
          active={settingsActive}
          iconRight={<Settings size={20} aria-hidden="true" />}
          onClick={onSettingsClick}
        >
          Settings
        </Button>
      </div>
    </div>
  )
}
