import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { BatchCandidateActions, SavedCandidateActions } from '../CandidateActions'
import type { CandidateStatus } from '../CandidateActions'
import { CandidateCard } from '../CandidateCard'
import { CandidateDetail } from '../CandidateDetail'
import { candidateFingerprint } from '../candidateFingerprint'
import { MAX_DISPLAYED_CANDIDATES, WORKSHOP_GENERATION_CONFIG } from '../generateBatch'
import type { WorkshopBatch } from '../generateBatch'
import { WORKSPACE_HASH, candidateKey } from '../shell/useWorkspaceRoute'
import type { CandidateDetailNavigation } from '../shell/useWorkspaceRoute'
import type { CandidateTab, FinalPuzzleDraft, SavedCandidate } from '../state/workshopReducer'
import { CandidateScreen } from './CandidateScreen'
import { GenerateControl } from './GenerateControl'
import type { GenerateProps } from './generateProps'
import { useCandidatesLayout } from './useCandidatesLayout'

/** Saving and removing candidates: WorkshopApp runs the writes; this workspace shows them. */
export interface CandidateOps {
  /** Fingerprint -> the write in progress for that candidate. */
  pending: Record<string, 'save' | 'remove'>
  /** Fingerprint -> why its last save or removal wasn't written. */
  errors: Record<string, string>
  /** Announced politely after a save or removal is written. */
  announcement: string
  onSave: (candidate: PoolCandidate, index: number) => void
  /** `onRemoved` runs once the removal is written, in the same update that drops it from the list. */
  onRemove: (fingerprint: string, onRemoved: () => void) => void
}

interface CandidatesWorkspaceProps {
  batch: WorkshopBatch | null
  /** Saved Candidates as written to the working draft (a save shows up once it's written). */
  savedCandidates: SavedCandidate[]
  tab: CandidateTab
  onTabChange: (tab: CandidateTab) => void
  /** Fingerprints of each tab's selection. */
  selectedId: string | null
  savedSelectedId: string | null
  onSelect: (tab: CandidateTab, fingerprint: string) => void
  /** The approved candidate's fingerprint. */
  approvedId: string | null
  finalPuzzle: FinalPuzzleDraft | null
  /** The Author clue that approving would use. */
  currentClue: string
  /** Errors from the last refused Generate (the inputs to fix are in Author). */
  generationErrors: string[]
  ops: CandidateOps
  onApprove: (fingerprint: string) => void
  onOpenFinal: () => void
  /** The control that approved (or reopens) the Final Puzzle; focus returns here from it. */
  approveButtonRef: RefObject<HTMLButtonElement | null>
  generate: GenerateProps
  /** The rest of #/candidates/<detail>, if the route names a candidate's detail screen. */
  candidateDetail: string | null
  detailNavigation: CandidateDetailNavigation
}

interface Entry {
  candidate: PoolCandidate
  fingerprint: string
  key: string
  saved: SavedCandidate | null
}

// Detail routes: #/candidates/<key> (Current Batch), #/candidates/saved/<key>.
const SAVED_DETAIL_PREFIX = 'saved/'

function parseDetail(detail: string | null): { collection: CandidateTab; key: string } | null {
  if (detail === null) return null
  return detail.startsWith(SAVED_DETAIL_PREFIX)
    ? { collection: 'saved', key: detail.slice(SAVED_DETAIL_PREFIX.length) }
    : { collection: 'batch', key: detail }
}

function detailRoute(collection: CandidateTab, key: string): string {
  return collection === 'saved' ? SAVED_DETAIL_PREFIX + key : key
}

// The gallery's scroll position, kept in its own history entry (view state,
// never the draft) so returning by Back or All Candidates can restore it.
interface GalleryScrollState {
  wsGalleryScroll: { collection: string; y: number }
}

function savedGalleryScroll(collection: string): number | null {
  const state: unknown = window.history.state
  if (typeof state !== 'object' || state === null || !('wsGalleryScroll' in state)) return null
  const saved = (state as GalleryScrollState).wsGalleryScroll
  return saved.collection === collection ? saved.y : null
}

function describeOrigin(saved: SavedCandidate | null): string | null {
  if (!saved) return null
  const { number, clue, batchSeed } = saved.origin
  const parts = [number !== null && `Candidate ${number}`, batchSeed && `of ${batchSeed}`, clue !== null && `(clue “${clue}”)`]
  const text = parts.filter(Boolean).join(' ')
  return text || null
}

const TABS: CandidateTab[] = ['batch', 'saved']
const TAB_ID: Record<CandidateTab, string> = { batch: 'ws-tab-current', saved: 'ws-tab-saved' }
const PANEL_ID: Record<CandidateTab, string> = { batch: 'ws-tabpanel-current', saved: 'ws-tabpanel-saved' }

// Candidates: two collections in one workspace, as tabs that share the
// gallery, inspector, and narrow-screen detail.
//
//   Current Batch     — the latest, session-only batch. Its one action is
//                       Save Candidate.
//   Saved Candidates  — the shortlist in the working draft, oldest first.
//                       Approve as Final Puzzle and Remove from Saved live
//                       here; the approved candidate can't be removed.
//
// The active tab decides the actions and which candidates the gallery,
// Previous/Next, and swiping go through. Each tab keeps its own selection
// (session state); Saved Candidates falls back to the candidate now at the
// last selected position (after a removal), and to the oldest at first.
//
// Wide workspaces show the gallery beside the inspector. Narrow ones (the
// stylesheet decides; see useCandidatesLayout) show one screen at a time:
// the gallery with its tabs, and a candidate's detail at #/candidates/<key>
// or #/candidates/saved/<key>, without the tabs. A key that names no
// candidate in its collection (a refresh of the session-only batch, a
// replaced batch, a malformed URL) is replaced with #/candidates; removing
// the candidate on screen moves to the one that took its place instead.
export function CandidatesWorkspace({
  batch,
  savedCandidates,
  tab,
  onTabChange,
  selectedId,
  savedSelectedId,
  onSelect,
  approvedId,
  finalPuzzle,
  currentClue,
  generationErrors,
  ops,
  onApprove,
  onOpenFinal,
  approveButtonRef,
  generate,
  candidateDetail,
  detailNavigation,
}: CandidatesWorkspaceProps) {
  const viewRef = useRef<HTMLDivElement>(null)
  const detailHeadingRef = useRef<HTMLHeadingElement>(null)
  const emptySavedActionRef = useRef<HTMLButtonElement>(null)
  const tabRefs = useRef<Partial<Record<CandidateTab, HTMLButtonElement | null>>>({})
  const layout = useCandidatesLayout(viewRef)

  const batchEntries = useMemo<Entry[]>(
    () =>
      (batch?.candidates ?? []).map((candidate) => {
        const fingerprint = candidateFingerprint(candidate)
        return { candidate, fingerprint, key: candidateKey(fingerprint), saved: null }
      }),
    [batch],
  )
  const savedEntries = useMemo<Entry[]>(
    () =>
      savedCandidates.map((saved) => ({
        candidate: saved.candidate,
        fingerprint: saved.fingerprint,
        key: candidateKey(saved.fingerprint),
        saved,
      })),
    [savedCandidates],
  )
  const savedSet = useMemo(() => new Set(savedCandidates.map((saved) => saved.fingerprint)), [savedCandidates])

  const route = useMemo(() => parseDetail(candidateDetail), [candidateDetail])
  // The detail route names its collection; otherwise the tab decides.
  const collection: CandidateTab = route?.collection ?? tab
  const entries = collection === 'saved' ? savedEntries : batchEntries
  // A key must name exactly one candidate in its collection.
  const detailIndex =
    route !== null && entries.filter((entry) => entry.key === route.key).length === 1
      ? entries.findIndex((entry) => entry.key === route.key)
      : -1
  const detailEntry = detailIndex >= 0 ? entries[detailIndex] : null

  const lastSavedIndex = useRef(0)
  let selectedIndex: number
  if (detailIndex >= 0) selectedIndex = detailIndex
  else if (collection === 'batch') selectedIndex = batchEntries.findIndex((entry) => entry.fingerprint === selectedId)
  else {
    const remembered = savedEntries.findIndex((entry) => entry.fingerprint === savedSelectedId)
    selectedIndex =
      remembered >= 0 ? remembered : savedEntries.length > 0 ? Math.min(lastSavedIndex.current, savedEntries.length - 1) : -1
  }
  const selected = selectedIndex >= 0 ? entries[selectedIndex] : null
  const screen = layout === 'screens' && detailEntry ? 'detail' : 'gallery'
  const collectionId = collection === 'saved' ? 'saved' : (batch?.seed ?? '')

  useEffect(() => {
    if (collection === 'saved' && selectedIndex >= 0) lastSavedIndex.current = selectedIndex
  }, [collection, selectedIndex])

  function statusOf(fingerprint: string): CandidateStatus {
    if (fingerprint === approvedId) return 'approved'
    const pending = ops.pending[fingerprint]
    if (pending === 'save') return 'saving'
    if (pending === 'remove') return 'removing'
    return savedSet.has(fingerprint) ? 'saved' : 'unsaved'
  }

  // A detail route being left by All Candidates after its candidate was
  // removed (history.back() settles later): it mustn't be discarded meanwhile.
  const leavingDetail = useRef<string | null>(null)

  // The detail route is what's selected, in its own tab; a key naming
  // nothing is dropped.
  useEffect(() => {
    if (route === null || candidateDetail === leavingDetail.current) return
    if (!detailEntry) {
      detailNavigation.discard()
      return
    }
    if (route.collection !== tab) onTabChange(route.collection)
    const current = route.collection === 'batch' ? selectedId : savedSelectedId
    if (detailEntry.fingerprint !== current) onSelect(route.collection, detailEntry.fingerprint)
  }, [route, candidateDetail, detailEntry, tab, selectedId, savedSelectedId, onSelect, onTabChange, detailNavigation])

  // Moving between the gallery and the detail screen (not a resize across
  // the breakpoint): the detail screen starts at its top with focus on its
  // heading; the gallery comes back where it was scrolled to, with focus on
  // the card that was open. Before paint, so neither visibly jumps. After a
  // removal, focus leaves the Remove button that's gone the same way.
  const previousView = useRef({ screen, layout, detailKey: detailEntry?.key ?? null })
  const focusAfterRemoval = useRef(false)
  useLayoutEffect(() => {
    const previous = previousView.current
    const detailKey = detailEntry?.key ?? null
    previousView.current = { screen, layout, detailKey }
    const removed = focusAfterRemoval.current
    focusAfterRemoval.current = false
    if (previous.layout !== layout) return
    if (screen === 'detail' && previous.screen === 'gallery') {
      window.scrollTo(0, 0)
      detailHeadingRef.current?.focus({ preventScroll: true })
    } else if (screen === 'detail' && previous.detailKey !== detailKey) {
      // Previous/Next or a swipe: show the new crossword if it's scrolled away.
      if ((viewRef.current?.getBoundingClientRect().top ?? 0) < 0) window.scrollTo(0, 0)
      if (removed) detailHeadingRef.current?.focus({ preventScroll: true })
    } else if (screen === 'gallery' && (previous.screen === 'detail' || removed)) {
      const y = previous.screen === 'detail' ? savedGalleryScroll(collectionId) : null
      if (y !== null) window.scrollTo(0, y)
      const key = selected?.key ?? null
      const card = key ? viewRef.current?.querySelector<HTMLElement>(`[data-candidate-key="${key}"] button`) : null
      if (card) {
        if (y === null) card.scrollIntoView?.({ block: 'nearest' })
        card.focus({ preventScroll: true })
      } else if (collection === 'saved') {
        emptySavedActionRef.current?.focus()
      }
    }
  }, [screen, layout, detailEntry, collectionId, selected, collection])

  function openCandidate(index: number) {
    const entry = entries[index]
    onSelect(collection, entry.fingerprint)
    if (layout === 'screens') {
      const scroll: GalleryScrollState = { wsGalleryScroll: { collection: collectionId, y: window.scrollY } }
      window.history.replaceState({ ...window.history.state, ...scroll }, '')
      detailNavigation.open(detailRoute(collection, entry.key))
    } else if (candidateDetail !== null) {
      // Widened while a detail route was open: keep the URL naming the selection.
      detailNavigation.show(detailRoute(collection, entry.key))
    }
  }

  function removeCandidate(entry: Entry, index: number) {
    const onDetail = screen === 'detail'
    const detail = candidateDetail
    ops.onRemove(entry.fingerprint, () => {
      // Select the candidate that takes its place, or the one before it.
      const remaining = savedEntries.filter((other) => other.fingerprint !== entry.fingerprint)
      const next = remaining[Math.min(index, remaining.length - 1)] ?? null
      lastSavedIndex.current = index
      focusAfterRemoval.current = true
      if (next) onSelect('saved', next.fingerprint)
      if (!onDetail) return
      if (next) detailNavigation.show(detailRoute('saved', next.key))
      else {
        leavingDetail.current = detail
        detailNavigation.close()
      }
    })
  }

  function actionsFor(entry: Entry, index: number, withApproveRef: boolean): ReactNode {
    const status = statusOf(entry.fingerprint)
    const error = ops.errors[entry.fingerprint] ?? null
    return collection === 'batch' ? (
      <BatchCandidateActions status={status} error={error} onSave={() => ops.onSave(entry.candidate, index)} />
    ) : (
      <SavedCandidateActions
        status={status}
        error={error}
        currentClue={currentClue}
        publication={entry.saved?.publication ?? null}
        onApprove={() => onApprove(entry.fingerprint)}
        onOpenFinal={onOpenFinal}
        onRemove={() => removeCandidate(entry, index)}
        approveButtonRef={withApproveRef ? approveButtonRef : undefined}
      />
    )
  }

  function batchSeedOf(entry: Entry): string | null {
    return entry.saved ? entry.saved.origin.batchSeed : (batch?.seed ?? null)
  }

  // Tabs follow the ARIA tabs pattern: one tab stop, arrows (and Home/End) move and select.
  function handleTabKeyDown(event: KeyboardEvent) {
    const index = TABS.indexOf(collection)
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? TABS[(index + 1) % TABS.length]
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? TABS[(index + TABS.length - 1) % TABS.length]
          : event.key === 'Home'
            ? TABS[0]
            : event.key === 'End'
              ? TABS[TABS.length - 1]
              : null
    if (!target) return
    event.preventDefault()
    onTabChange(target)
    tabRefs.current[target]?.focus()
  }

  function renderGallery(heading: string, meta: ReactNode, note: ReactNode, empty: ReactNode) {
    return (
      <div className="ws-results">
        <section className="ws-candidates" aria-labelledby="ws-candidates-heading">
          <h3 id="ws-candidates-heading" className="ws-panel__heading">
            {heading}
          </h3>
          {meta}
          {note}
          {entries.length > 0 ? (
            <ul className={layout === 'screens' ? 'ws-card-grid ws-card-grid--compact' : 'ws-card-grid'}>
              {entries.map((entry, index) => (
                <li key={entry.fingerprint} data-candidate-key={entry.key}>
                  <CandidateCard
                    candidate={entry.candidate}
                    number={index + 1}
                    isSelected={index === selectedIndex}
                    status={statusOf(entry.fingerprint)}
                    onSelect={() => openCandidate(index)}
                    compact={layout === 'screens'}
                    // Back from Final Puzzle returns focus to the card when there's no inspector.
                    buttonRef={layout === 'screens' && index === selectedIndex ? approveButtonRef : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            empty
          )}
        </section>

        {layout === 'columns' && (
          <div className="ws-panel ws-detail-panel">
            {selected ? (
              <CandidateDetail
                candidate={selected.candidate}
                number={selectedIndex + 1}
                batchSeed={batchSeedOf(selected)}
                origin={describeOrigin(selected.saved)}
                status={statusOf(selected.fingerprint)}
                actions={actionsFor(selected, selectedIndex, true)}
              />
            ) : (
              <p className="ws-muted">Select a candidate to inspect it.</p>
            )}
          </div>
        )}
      </div>
    )
  }

  let panel: ReactNode
  if (collection === 'saved') {
    panel =
      savedEntries.length === 0 ? (
        <div className="ws-panel ws-empty">
          <p>
            <strong>No saved candidates yet</strong>
          </p>
          <p>Save promising layouts from Current Batch to compare them here.</p>
          <button
            type="button"
            className="ws-button ws-button--secondary"
            ref={emptySavedActionRef}
            onClick={() => {
              onTabChange('batch')
              tabRefs.current.batch?.focus()
            }}
          >
            View Current Batch
          </button>
        </div>
      ) : (
        renderGallery(
          `Saved Candidates (${savedEntries.length})`,
          null,
          <p className="ws-muted ws-candidates__note">
            Oldest first. Saved candidates stay in the working draft until you start a new puzzle. Approve one to make it
            the Final Puzzle.
          </p>,
          null,
        )
      )
  } else if (!batch) {
    panel = (
      <div className="ws-panel ws-empty">
        <p>
          <strong>No current batch.</strong> Generated candidates are kept only until you generate again, close, or
          refresh the Workshop; the ones you saved are in Saved Candidates. Generate a new batch here, or adjust the
          inputs in <a href={WORKSPACE_HASH.author}>Author</a>.
        </p>
        {finalPuzzle && (
          <div className="ws-restored-final">
            <p>
              Approved Candidate {finalPuzzle.number}
              {finalPuzzle.inputs.id.trim() && ` · ${finalPuzzle.inputs.id.trim()}`}
              {finalPuzzle.inputs.clue.trim() && ` · “${finalPuzzle.inputs.clue.trim()}”`} is the Final Puzzle in the
              working draft.
            </p>
            <button type="button" className="ws-button" ref={approveButtonRef} onClick={onOpenFinal}>
              Open Final Puzzle
            </button>
          </div>
        )}
      </div>
    )
  } else {
    const approvedIndex = batchEntries.findIndex((entry) => entry.fingerprint === approvedId)
    panel = renderGallery(
      `Generated Candidates (${batchEntries.length})`,
      <p className="ws-meta" role="status">
        Clue “{batch.clue}” · {batch.pool.length} words · seed {batch.seed} · {batch.diversity.subsetTrialsAttempted}{' '}
        trials, {batch.diversity.uniqueCandidateCount} unique
        {batch.diversity.uniqueCandidateCount > MAX_DISPLAYED_CANDIDATES && ` (showing first ${MAX_DISPLAYED_CANDIDATES})`}{' '}
        · {Math.round(batch.elapsedMs)} ms
        {batch.priorityWords.length > 0 && ` · Priority Words: ${batch.priorityWords.join(', ')}`}
        {approvedIndex >= 0 && ` · Candidate ${approvedIndex + 1} approved`}
      </p>,
      <p className="ws-muted ws-candidates__note">
        Generated candidates are temporary. Save the ones worth keeping: unsaved candidates are lost when you generate
        again, close, or refresh the Workshop.
      </p>,
      batch.priorityWords.length > 0 ? (
        <p>
          No candidates containing all Priority Words ({batch.priorityWords.join(', ')}) were found in this generation
          batch of {batch.diversity.subsetTrialsAttempted} trials. That doesn’t mean they can’t fit together — try
          generating again, removing a Priority Word, or adjusting your candidate word list.
        </p>
      ) : (
        <p>
          No valid candidates with {WORKSHOP_GENERATION_CONFIG.minAnswers}–{WORKSHOP_GENERATION_CONFIG.maxAnswers} answers
          were found in this batch. Try generating again, or add more (especially shorter) candidate words.
        </p>
      ),
    )
  }

  return (
    <div className="ws-candidates-workspace" ref={viewRef}>
      <div className="ws-workspace__header">
        <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
          Candidates
        </h2>
        <GenerateControl type="button" secondary {...generate} />
      </div>

      {generationErrors.length > 0 && (
        <div className="ws-errors" role="alert">
          <ul>
            {generationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <p>
            Your authoring inputs are unchanged. <a href={WORKSPACE_HASH.author}>Review them in Author</a>.
          </p>
        </div>
      )}

      {/* The detail screen replaces the whole gallery on narrow workspaces,
          tabs and notes included: they describe the lists, not one
          candidate. Returning restores them. */}
      {screen === 'detail' && detailEntry ? (
        <CandidateScreen
          candidate={detailEntry.candidate}
          index={detailIndex}
          total={entries.length}
          batchSeed={batchSeedOf(detailEntry)}
          origin={describeOrigin(detailEntry.saved)}
          status={statusOf(detailEntry.fingerprint)}
          actions={actionsFor(detailEntry, detailIndex, false)}
          headingRef={detailHeadingRef}
          onShow={(index) => {
            onSelect(collection, entries[index].fingerprint)
            detailNavigation.show(detailRoute(collection, entries[index].key))
          }}
          onAllCandidates={detailNavigation.close}
        />
      ) : (
        <>
          <div className="ws-tabs" role="tablist" aria-label="Candidate lists" onKeyDown={handleTabKeyDown}>
            {TABS.map((each) => (
              <button
                key={each}
                type="button"
                role="tab"
                id={TAB_ID[each]}
                className="ws-tabs__tab"
                aria-selected={collection === each}
                aria-controls={collection === each ? PANEL_ID[each] : undefined}
                tabIndex={collection === each ? 0 : -1}
                ref={(element) => {
                  tabRefs.current[each] = element
                }}
                onClick={() => onTabChange(each)}
              >
                {each === 'batch' ? 'Current Batch' : 'Saved Candidates'}{' '}
                <span className="ws-tabs__count">({each === 'batch' ? batchEntries.length : savedEntries.length})</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={PANEL_ID[collection]} aria-labelledby={TAB_ID[collection]} className="ws-tabpanel">
            {panel}
          </div>
        </>
      )}

      {/* Saves and removals, once written (a failure is an alert beside its action). */}
      <p className="ws-visually-hidden" role="status">
        {ops.announcement}
      </p>
    </div>
  )
}
