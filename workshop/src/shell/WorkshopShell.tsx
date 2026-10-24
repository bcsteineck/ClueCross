import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { WORKSPACE_HASH, WORKSPACE_LABEL } from './useWorkspaceRoute'
import type { Workspace } from './useWorkspaceRoute'

const AUTHORING_WORKSPACES: Workspace[] = ['author', 'candidates', 'final', 'publish']

interface WorkshopShellProps {
  workspace: Workspace
  /** Production-operations mode: shows the banner everywhere and adds Production Schedule. */
  production: boolean
  /** False until the working draft has loaded, so nothing navigable appears over an unloaded draft. */
  navigation: boolean
  /** Draft status and New Puzzle, shown above every workspace. */
  statusBar?: ReactNode
  /** Called when a navigation link is chosen (the link's own hash change follows). */
  onNavigate: (target: Workspace) => void
  mainRef: RefObject<HTMLElement | null>
  children: ReactNode
}

interface WorkshopNavProps {
  workspace: Workspace
  production: boolean
  onNavigate?: (target: Workspace) => void
}

// Plain links to hash routes: native link semantics, the current one marked
// with aria-current="page" (and a visible marker, not color alone).
function WorkshopNav({ workspace, production, onNavigate }: WorkshopNavProps) {
  const link = (target: Workspace) => (
    <li key={target}>
      <a
        href={WORKSPACE_HASH[target]}
        className="ws-shell-nav__link"
        aria-current={workspace === target ? 'page' : undefined}
        onClick={() => onNavigate?.(target)}
      >
        {WORKSPACE_LABEL[target]}
      </a>
    </li>
  )
  return (
    <>
      <ul className="ws-shell-nav__list">{AUTHORING_WORKSPACES.map(link)}</ul>
      {production && (
        <>
          <p className="ws-shell-nav__group">Production</p>
          <ul className="ws-shell-nav__list">{link('schedule')}</ul>
        </>
      )}
    </>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The Workshop application shell: a persistent labelled sidebar from 1024px
// up; below that, a top bar whose menu button opens the same navigation in
// a modal drawer (focus moves in, Tab stays inside, Escape or a choice
// closes it, and focus returns to the menu button unless a new workspace
// takes it). The Production-operations banner and the draft status bar sit
// above every workspace and are never covered.
export function WorkshopShell({ workspace, production, navigation, statusBar, onNavigate, mainRef, children }: WorkshopShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const returnFocusToMenu = useRef(false)

  useEffect(() => {
    if (drawerOpen) {
      drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    } else if (returnFocusToMenu.current) {
      // After the close renders, so the menu button is no longer inert.
      returnFocusToMenu.current = false
      menuButtonRef.current?.focus()
    }
  }, [drawerOpen])

  // The drawer only exists below the desktop breakpoint; widening the window closes it.
  useEffect(() => {
    if (!drawerOpen || typeof window.matchMedia !== 'function') return
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onChange = () => desktop.matches && setDrawerOpen(false)
    desktop.addEventListener('change', onChange)
    return () => desktop.removeEventListener('change', onChange)
  }, [drawerOpen])

  function closeDrawer(returnFocus: boolean) {
    returnFocusToMenu.current = returnFocus
    setDrawerOpen(false)
  }

  function handleDrawerKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDrawer(true)
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="ws-shell">
      <header className="ws-topbar" inert={drawerOpen}>
        {navigation && (
          <button
            type="button"
            className="ws-button ws-button--secondary ws-topbar__menu"
            ref={menuButtonRef}
            aria-expanded={drawerOpen}
            aria-controls="ws-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            Menu
          </button>
        )}
        <span className="ws-topbar__brand">ClueCross Workshop</span>
        {navigation && <span className="ws-topbar__current">{WORKSPACE_LABEL[workspace]}</span>}
      </header>

      <aside className="ws-sidebar" inert={drawerOpen}>
        <p className="ws-sidebar__brand">ClueCross Workshop</p>
        <p className="ws-muted">Internal authoring tool.</p>
        {navigation && (
          <nav className="ws-shell-nav" aria-label="Workshop">
            <WorkshopNav workspace={workspace} production={production} onNavigate={onNavigate} />
          </nav>
        )}
      </aside>

      <div className="ws-shell__main" inert={drawerOpen}>
        {production && (
          <div className="ws-production-banner" role="note" aria-label="Production operations">
            <p>
              <strong>Production Operations Enabled.</strong> Production Preview, Publish, and the Production Schedule act on
              the live ClueCross calendar. Publishing to the dev calendar still targets dev.
            </p>
          </div>
        )}
        {statusBar}
        <main className="ws-app" ref={mainRef}>
          <h1 className="ws-visually-hidden">ClueCross Workshop</h1>
          {children}
        </main>
      </div>

      {drawerOpen && (
        <>
          <div className="ws-drawer-backdrop" aria-hidden="true" onClick={() => closeDrawer(true)} />
          <div
            id="ws-drawer"
            className="ws-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-drawer-heading"
            ref={drawerRef}
            onKeyDown={handleDrawerKeyDown}
          >
            <div className="ws-drawer__header">
              <p id="ws-drawer-heading" className="ws-sidebar__brand">
                ClueCross Workshop
              </p>
              <button type="button" className="ws-button ws-button--secondary" onClick={() => closeDrawer(true)}>
                Close
              </button>
            </div>
            <nav className="ws-shell-nav" aria-label="Workshop (menu)">
              <WorkshopNav
                workspace={workspace}
                production={production}
                // Choosing the current workspace returns focus to the menu;
                // choosing another lets that workspace take focus.
                onNavigate={(target) => {
                  closeDrawer(target === workspace)
                  onNavigate(target)
                }}
              />
            </nav>
          </div>
        </>
      )}
    </div>
  )
}
