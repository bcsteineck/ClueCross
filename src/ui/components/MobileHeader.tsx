import { Archive, Info, Settings } from 'lucide-react'
import './MobileHeader.scss'

export interface MobileHeaderProps {
  onLogoClick: () => void
  onInfoClick: () => void
  onSettingsClick: () => void
  onArchiveClick: () => void
  settingsActive?: boolean
}

// The persistent mobile header (spec section 6): logo, Info (opens How to
// Play), Settings, Archive — icon-only, no hamburger. Stays visible across
// all five primary views; Stats/Archive/How to Play additionally render
// their own "Back to Puzzle" bar within the content area (see
// MobileBackBar), since none of these icons is itself a way back to the
// puzzle from there.
export function MobileHeader({
  onLogoClick,
  onInfoClick,
  onSettingsClick,
  onArchiveClick,
  settingsActive,
}: MobileHeaderProps) {
  return (
    <div className="mobile-header">
      <button type="button" className="mobile-header__logo" onClick={onLogoClick}>
        <img src="/images/logo/cc_logo.svg" alt="ClueCross" className="mobile-header__logo-image" />
      </button>
      <div className="mobile-header__icons">
        <button
          type="button"
          className="mobile-header__icon-button"
          aria-label="How to Play"
          onClick={onInfoClick}
        >
          <Info size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="mobile-header__icon-button"
          aria-label="Settings"
          aria-pressed={settingsActive}
          onClick={onSettingsClick}
        >
          <Settings size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="mobile-header__icon-button"
          aria-label="Archive"
          onClick={onArchiveClick}
        >
          <Archive size={22} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
