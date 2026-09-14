import { Archive, Settings } from 'lucide-react'
import { Button } from './Button'
import './Header.scss'

export interface HeaderProps {
  onLogoClick?: () => void
  archiveActive?: boolean
  onArchiveClick?: () => void
  settingsActive?: boolean
  onSettingsClick?: () => void
}

// Desktop-only now — mobile has its own persistent header (MobileHeader)
// with icon-only Info/Settings/Archive controls and no hamburger (spec
// section 6). Desktop has no How-to-Play trigger here either (confirmed
// absent in the Figma desktop header) — that role is filled by the right
// column's collapsible How It Works card instead.
export function Header({
  onLogoClick,
  archiveActive,
  onArchiveClick,
  settingsActive,
  onSettingsClick,
}: HeaderProps) {
  return (
    <div className="header">
      {/* Full-bleed bar, edge to edge — this inner wrapper is what actually
          centers and width-constrains the logo/nav, matching the dashboard
          columns below (see desktop-content-width in _tokens.scss). */}
      <div className="header__inner">
        <button type="button" className="header__logo" onClick={onLogoClick}>
          <img src="/images/logo/cc_logo.svg" alt="ClueCross" className="header__logo-image" />
        </button>
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
    </div>
  )
}
