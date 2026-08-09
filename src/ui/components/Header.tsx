import { Archive, Info, Menu, Settings } from 'lucide-react'
import { Button } from './Button'
import './Header.scss'

export interface HeaderProps {
  onLogoClick?: () => void
  onHowToPlayClick?: () => void
  archiveActive?: boolean
  onArchiveClick?: () => void
  settingsActive?: boolean
  onSettingsClick?: () => void
  onMenuClick?: () => void
}

export function Header({
  onLogoClick,
  onHowToPlayClick,
  archiveActive,
  onArchiveClick,
  settingsActive,
  onSettingsClick,
  onMenuClick,
}: HeaderProps) {
  return (
    <div className="header">
      <button type="button" className="header__logo" onClick={onLogoClick}>
        ClueCross
      </button>
      <div className="header__options">
        <Button
          variant="text"
          iconRight={<Info size={20} aria-hidden="true" />}
          onClick={onHowToPlayClick}
        >
          How to Play
        </Button>
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
      <button
        type="button"
        className="header__menu-button"
        aria-label="Open menu"
        onClick={onMenuClick}
      >
        <Menu size={24} aria-hidden="true" />
      </button>
    </div>
  )
}
