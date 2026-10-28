import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import type { Direction } from '../../../tools/generator/src/types.js'
import type { DraftSaveStatus, ReplaceResult } from '../draft/draftSaver'
import type { EditedVersion } from './editedCandidate'
import { EditorBoard } from './EditorBoard'
import type { BoardPlacement } from './EditorBoard'
import { EMPTY_HISTORY, recordEdit, redo, undo } from './editorHistory'
import type { EditorHistory } from './editorHistory'
import {
  EDITOR_GRID_SIZE,
  addManualWord,
  addWord,
  cellName,
  checkPlacement,
  layoutIssues,
  moveWord,
  nextWordId,
  numberWords,
  orderedWords,
  removeWord,
  replaceWord,
  sameAnswer,
  selectAt,
  suggestionCount,
  unusedWords,
  wordCells,
  wordsAt,
} from './editorLayout'
import type { EditResult, EditorLayout, EditorPoolWord, EditorWord, PlacementCheck } from './editorLayout'

// The Manual Editor for one edited version: the 12×12 board as the focus,
// with the placed words, the unused words, the selected word's actions,
// placement controls, and the validation summary beside it.
//
// Every completed operation (add, move, replace, remove, reset) goes to
// onCommit at once — WorkshopApp autosaves it — and is one Undo step.
// Selecting, previewing, choosing Across or Down, and canceling change
// nothing durable and are never Undo steps. Undo/Redo history is this
// component's state: it ends when the Editor closes or switches version.
//
// Placement is click-to-place: choose a word (or Move/Replace), then click
// a starting cell. Suggested starts are the connected placements; any
// other cell can still be tried, and a refused one is explained beside
// the board without changing anything.

type Operation = { kind: 'add'; word: string } | { kind: 'move'; id: string } | { kind: 'replace'; id: string } | null

type Notice = { tone: 'error' | 'info'; text: string } | null

interface EditorWorkspaceProps {
  edit: EditedVersion
  name: string
  /** Where it came from, for context ("Edited from Candidate 4"). */
  context: string
  /** Why it can't be edited here (approved or published), else null. */
  locked: string | null
  saveStatus: DraftSaveStatus
  /** The candidate's custom name ('' when it has none). */
  customName: string
  onCommit: (layout: EditorLayout) => void
  onRename: (name: string) => void
  /** Saves the current layout as a new version and switches to it once it's written. */
  onSaveAsNew: (layout: EditorLayout) => Promise<ReplaceResult>
  /** For a locked version: a new editable copy. */
  onEditCopy: () => void
  onBack: () => void
  backButtonRef?: RefObject<HTMLButtonElement | null>
}

const LAYOUT_PROPERTY = '--ws-editor-layout'

/** The stylesheet decides (container query) whether there's room to edit; React reads its answer. */
function useEditorReadOnly(ref: RefObject<HTMLElement | null>): boolean {
  const [readOnly, setReadOnly] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setReadOnly(getComputedStyle(element).getPropertyValue(LAYOUT_PROPERTY).trim() === 'readonly')
    update()
    const container = element.closest('.ws-app')
    const observer = container && typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    if (container) observer?.observe(container)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref])
  return readOnly
}

const directionName = (direction: Direction) => (direction === 'across' ? 'Across' : 'Down')

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** Undo/Redo never takes a word out of the pool: manually added words stay available. */
function mergedPool(current: EditorPoolWord[], restored: EditorPoolWord[]): EditorPoolWord[] {
  const extra = current.filter((entry) => !restored.some((other) => sameAnswer(other.word, entry.word)))
  return [...restored, ...extra]
}

function describeWord(word: EditorWord, numbers: Map<string, number>): string {
  return `${numbers.get(word.id)} ${directionName(word.direction)}: ${word.word}`
}

function boardLabel(words: readonly EditorWord[], numbers: Map<string, number>, prefix: string): string {
  if (words.length === 0) return `${prefix}, 12 by 12 board: empty.`
  return `${prefix}, 12 by 12 board: ${orderedWords(words)
    .map((word) => `${describeWord(word, numbers)} at ${cellName(word.start.x, word.start.y)}`)
    .join('; ')}.`
}

const SAVE_LABEL: Record<DraftSaveStatus['kind'], string> = {
  saved: 'All changes saved',
  pending: 'Saving…',
  saving: 'Saving…',
  failed: 'Not saved — see the message above',
  conflict: 'Not saved — see the message above',
}

export function EditorWorkspace({
  edit,
  name,
  context,
  locked,
  saveStatus,
  customName,
  onCommit,
  onRename,
  onSaveAsNew,
  onEditCopy,
  onBack,
  backButtonRef,
}: EditorWorkspaceProps) {
  const rootRef = useRef<HTMLElement>(null)
  const mobile = useEditorReadOnly(rootRef)
  const readOnly = mobile || locked !== null
  const layout: EditorLayout = useMemo(() => ({ words: edit.words, pool: edit.pool }), [edit.words, edit.pool])
  const [history, setHistory] = useState<EditorHistory>(EMPTY_HISTORY)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [operation, setOperation] = useState<Operation>(null)
  const [direction, setDirection] = useState<Direction>('across')
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null)
  const [view, setView] = useState<'current' | 'original'>('current')
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [branch, setBranch] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const resetButtonRef = useRef<HTMLButtonElement>(null)
  const resetCancelRef = useRef<HTMLButtonElement>(null)
  const restoreResetFocus = useRef(false)

  const words = layout.words
  const selected = words.find((word) => word.id === selectedId) ?? null
  const numbers = useMemo(() => numberWords(words), [words])
  const issues = useMemo(() => layoutIssues(words, edit.priorityWords), [words, edit.priorityWords])
  const unused = useMemo(() => unusedWords(layout), [layout])
  // Connected placements for every unused word: recomputed only when the board or pool changes.
  const counts = useMemo(() => new Map(unused.map((entry) => [entry.word, suggestionCount(words, entry.word)])), [unused, words])
  const editing = !readOnly && view === 'current'

  // What's being placed, if anything: the word, its direction, and the word it moves.
  const placing = useMemo(() => {
    if (!operation || operation.kind === 'replace') return null
    const word = operation.kind === 'add' ? operation.word : words.find((each) => each.id === operation.id)?.word
    if (!word) return null
    return { word, excludeId: operation.kind === 'move' ? operation.id : undefined }
  }, [operation, words])

  // Every start checked once per word, direction, and board (not per hover).
  const boardPlacement = useMemo<BoardPlacement | null>(() => {
    if (!placing) return null
    const checks = new Map<string, PlacementCheck>()
    const suggested = new Set<string>()
    const empty = words.filter((word) => word.id !== placing.excludeId).length === 0
    for (let y = 0; y < EDITOR_GRID_SIZE; y++) {
      for (let x = 0; x < EDITOR_GRID_SIZE; x++) {
        const check = checkPlacement(words, { word: placing.word, direction, start: { x, y } }, placing.excludeId)
        checks.set(`${x},${y}`, check)
        if (check.ok && (empty || check.crossings > 0)) suggested.add(`${x},${y}`)
      }
    }
    return { placement: { word: placing.word, direction }, checks, suggested, movingId: placing.excludeId ?? null }
  }, [placing, direction, words])

  // A selected word that's gone (undone, removed) is deselected.
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null)
  }, [selectedId, selected])

  useEffect(() => {
    if (confirmingReset) resetCancelRef.current?.focus()
    else if (restoreResetFocus.current) {
      restoreResetFocus.current = false
      resetButtonRef.current?.focus()
    }
  }, [confirmingReset])

  function commit(result: EditResult, done: string) {
    if (!result.ok) {
      setNotice({ tone: 'error', text: `${result.reason} Nothing was changed.` })
      return false
    }
    setHistory((current) => recordEdit(current, layout))
    onCommit(result.layout)
    setNotice({ tone: 'info', text: done })
    return true
  }

  function cancelOperation(message = 'Canceled. Nothing was changed.') {
    if (!operation) return
    setOperation(null)
    setPreview(null)
    setNotice({ tone: 'info', text: message })
  }

  function startAdd(word: string) {
    setOperation({ kind: 'add', word })
    setPreview(null)
    setNotice({ tone: 'info', text: `Placing ${word}. Choose a starting cell on the board, or press Escape to cancel.` })
  }

  function handleCellClick(x: number, y: number) {
    if (!editing) return
    if (operation?.kind === 'add' || operation?.kind === 'move') {
      const start = { x, y }
      const placement = `${directionName(direction)} at ${cellName(x, y)}`
      const result =
        operation.kind === 'add'
          ? addWord(layout, { word: operation.word, direction, start }, nextWordId(words, edit.baseline, edit.original))
          : moveWord(layout, operation.id, direction, start)
      const word = placing?.word ?? ''
      const placed = operation.kind === 'add' ? `Placed ${word} ${placement}.` : `Moved ${word} to ${placement}.`
      if (commit(result, placed)) {
        setOperation(null)
        setPreview(null)
        if (result.ok && operation.kind === 'add') setSelectedId(result.layout.words.at(-1)?.id ?? null)
      }
      return
    }
    if (operation?.kind === 'replace') return
    // An empty cell clears the selection; see selectAt for intersections.
    setSelectedId(selectAt(words, x, y, selectedId))
  }

  function handleRemove() {
    if (!selected || !editing) return
    if (commit(removeWord(layout, selected.id), `Removed ${selected.word}. It’s back in the unused words.`)) setSelectedId(null)
  }

  function handleReplace(replacement: string) {
    if (operation?.kind !== 'replace') return
    const target = words.find((word) => word.id === operation.id)
    if (!target) return
    const newId = nextWordId(words, edit.baseline, edit.original)
    const result = replaceWord(layout, target.id, replacement, newId)
    if (commit(result, `Replaced ${target.word} with ${replacement}. ${target.word} is back in the unused words.`)) {
      setOperation(null)
      setSelectedId(newId)
    }
  }

  function handleUndo() {
    if (!editing) return
    const step = undo(history, layout)
    if (!step) return
    setHistory(step.history)
    setOperation(null)
    setPreview(null)
    onCommit({ words: step.layout.words, pool: mergedPool(layout.pool, step.layout.pool) })
    setNotice({ tone: 'info', text: 'Undone.' })
  }

  function handleRedo() {
    if (!editing) return
    const step = redo(history, layout)
    if (!step) return
    setHistory(step.history)
    setOperation(null)
    setPreview(null)
    onCommit({ words: step.layout.words, pool: mergedPool(layout.pool, step.layout.pool) })
    setNotice({ tone: 'info', text: 'Redone.' })
  }

  function handleReset() {
    setConfirmingReset(false)
    setOperation(null)
    setPreview(null)
    setSelectedId(null)
    // Placements only: the pool (manually added words included) is kept.
    if (commit({ ok: true, layout: { words: edit.baseline, pool: layout.pool } }, 'Layout reset to this version’s starting arrangement.')) {
      resetButtonRef.current?.focus()
    }
  }

  function handleManualSubmit(event: FormEvent) {
    event.preventDefault()
    const result = addManualWord(layout, manual)
    if (!result.ok) {
      setManualError(result.reason)
      return
    }
    setManualError(null)
    setManual('')
    // Adding to the pool is saved, but isn't an Undo step: placing it is.
    onCommit(result.layout)
    if (operation?.kind === 'replace') {
      const target = words.find((word) => word.id === operation.id)
      if (target) {
        const newId = nextWordId(words, edit.baseline, edit.original)
        const replaced = replaceWord(result.layout, target.id, result.word, newId)
        if (replaced.ok) {
          setHistory((current) => recordEdit(current, result.layout))
          onCommit(replaced.layout)
          setOperation(null)
          setSelectedId(newId)
          setNotice({ tone: 'info', text: `Added ${result.word} (Manually Added) and replaced ${target.word} with it.` })
        } else {
          setNotice({ tone: 'error', text: `Added ${result.word} to the pool, but ${replaced.reason} Nothing on the board was changed.` })
        }
      }
      return
    }
    startAdd(result.word)
  }

  async function handleSaveAsNew() {
    if (branch.busy) return
    setOperation(null)
    setPreview(null)
    setBranch({ busy: true, error: null })
    const result = await onSaveAsNew(layout)
    // On success this Editor is replaced by the new version's.
    if (!result.ok) setBranch({ busy: false, error: `Not saved as a new candidate: ${result.message} You’re still editing this version.` })
  }

  // Shortcuts: never while typing in a field, and never with other modifiers.
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {})
  shortcuts.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || isTypingTarget(event.target) || confirmingReset) return
    const keyName = event.key.toLowerCase()
    const command = event.metaKey || event.ctrlKey
    if (command && !event.altKey && keyName === 'z') {
      if (!editing) return
      event.preventDefault()
      if (event.shiftKey) handleRedo()
      else handleUndo()
      return
    }
    if (command || event.altKey) return
    if (event.key === 'Escape' && operation) {
      event.preventDefault()
      cancelOperation()
    } else if (!editing) {
      return
    } else if (keyName === 'a' && !event.shiftKey) {
      setDirection('across')
    } else if (keyName === 'd' && !event.shiftKey) {
      setDirection('down')
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selected && !operation) {
      event.preventDefault()
      handleRemove()
    }
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcuts.current(event)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  const shownWords = view === 'original' ? edit.original : words
  const originalNumbers = useMemo(() => numberWords(edit.original), [edit.original])
  const filteredUnused = unused.filter((entry) => entry.word.includes(search.trim().toUpperCase().replace(/[\s\-'’]/g, '')))
  const previewCheck = boardPlacement && preview ? boardPlacement.checks.get(`${preview.x},${preview.y}`) : undefined
  const suggestedCount = boardPlacement?.suggested.size ?? 0
  const crossings = selected ? wordCells(selected).filter((cell) => wordsAt(words, cell.x, cell.y).length > 1).length : 0

  const heading = (
    <div className="ws-editor__header">
      <div>
        <h2 className="ws-workspace__title" tabIndex={-1} data-workspace-heading>
          {name}
          <span className="ws-badge ws-badge--saved">Edited</span>
        </h2>
        <p className="ws-muted">{context}</p>
      </div>
      <div className="ws-publish__actions">
        <button type="button" className="ws-button" onClick={onBack} ref={backButtonRef}>
          Back to Saved Candidates
        </button>
      </div>
    </div>
  )

  const validation = (
    <section className="ws-editor__validation" aria-labelledby="ws-editor-validation-heading">
      <h3 id="ws-editor-validation-heading" className="ws-detail__subheading">
        Validation
      </h3>
      <p className="ws-visually-hidden" aria-live="polite">
        {issues.blocking.length === 0
          ? 'No blocking issues.'
          : `${issues.blocking.length} blocking ${issues.blocking.length === 1 ? 'issue' : 'issues'}.`}{' '}
        {issues.advisory.length > 0 && `${issues.advisory.length} ${issues.advisory.length === 1 ? 'warning' : 'warnings'}.`}
      </p>
      {issues.blocking.length === 0 ? (
        <p className="ws-final__status-ok">
          <strong>No blocking issues.</strong> One connected crossword.
        </p>
      ) : (
        <div className="ws-editor__issues ws-editor__issues--blocking">
          <p>
            <strong>Blocking — can’t be approved yet:</strong>
          </p>
          <ul>
            {issues.blocking.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {issues.advisory.length > 0 && (
        <div className="ws-editor__issues ws-editor__issues--advisory">
          <p>
            <strong>Warnings (don’t block approval):</strong>
          </p>
          <ul>
            {issues.advisory.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )

  const placedList = (
    <section aria-labelledby="ws-editor-placed-heading">
      <h3 id="ws-editor-placed-heading" className="ws-detail__subheading">
        Placed words ({words.length})
      </h3>
      {words.length === 0 ? (
        <p className="ws-muted">No words on the board.</p>
      ) : (
        <ul className="ws-editor__list">
          {orderedWords(words).map((word) => (
            <li key={word.id}>
              {editing ? (
                <button
                  type="button"
                  className="ws-editor__word"
                  aria-pressed={word.id === selectedId}
                  onClick={() => {
                    setSelectedId(word.id === selectedId ? null : word.id)
                    if (operation?.kind !== 'add') setOperation(null)
                  }}
                >
                  <span className="ws-editor__word-number">{numbers.get(word.id)} {directionName(word.direction)}</span>
                  <span className="ws-editor__word-text">{word.word}</span>
                  {word.id === selectedId && <span className="ws-editor__word-tag">Selected</span>}
                </button>
              ) : (
                <span className="ws-editor__word">
                  <span className="ws-editor__word-number">{numbers.get(word.id)} {directionName(word.direction)}</span>
                  <span className="ws-editor__word-text">{word.word}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  if (readOnly) {
    return (
      <section className="ws-editor ws-editor--readonly" aria-label="Editor" ref={rootRef} key="editor">
        {heading}
        {mobile ? (
          <p className="ws-final__notice" role="note">
            <strong>Read-only on this screen.</strong> Editing a crossword needs a larger screen. You can review this
            version here, and edit it on a wider window.
          </p>
        ) : (
          <div className="ws-final__notice" role="note">
            <p>
              <strong>This version can’t be changed.</strong> {locked}
            </p>
            <button type="button" className="ws-button ws-button--secondary" onClick={onEditCopy}>
              Edit a New Copy
            </button>
          </div>
        )}
        <div className="ws-editor__body">
          <div className="ws-editor__board">
            <EditorBoard words={words} label={boardLabel(words, numbers, name)} interactive={false} />
          </div>
          <div className="ws-editor__tools">
            {validation}
            {placedList}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="ws-editor" aria-label="Editor" ref={rootRef} key="editor">
      {heading}

      <div className="ws-editor__toolbar">
        <div className="ws-field ws-editor__name">
          <label htmlFor="ws-editor-name">Name</label>
          <input id="ws-editor-name" value={customName} placeholder={name} onChange={(event) => onRename(event.target.value)} />
        </div>
        <div className="ws-editor__toolbar-actions">
          <button type="button" className="ws-button ws-button--secondary" onClick={handleUndo} aria-disabled={history.past.length === 0 || view !== 'current'} aria-keyshortcuts="Control+Z Meta+Z">
            Undo
          </button>
          <button type="button" className="ws-button ws-button--secondary" onClick={handleRedo} aria-disabled={history.future.length === 0 || view !== 'current'} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">
            Redo
          </button>
          <button
            type="button"
            className="ws-button ws-button--secondary"
            ref={resetButtonRef}
            aria-expanded={confirmingReset}
            aria-controls={confirmingReset ? 'ws-editor-reset-confirm' : undefined}
            aria-disabled={view !== 'current'}
            onClick={() => view === 'current' && setConfirmingReset(true)}
          >
            Reset Layout
          </button>
          <button type="button" className="ws-button ws-button--secondary" onClick={() => void handleSaveAsNew()} aria-disabled={branch.busy}>
            {branch.busy ? 'Saving New Candidate…' : 'Save as New Candidate'}
          </button>
        </div>
        <p className="ws-muted ws-editor__save" aria-hidden="true">
          {SAVE_LABEL[saveStatus.kind]}
        </p>
      </div>

      {branch.error && (
        <p className="ws-publish__problem" role="alert">
          {branch.error}
        </p>
      )}

      {confirmingReset && (
        <div
          id="ws-editor-reset-confirm"
          className="ws-publish__confirm"
          role="group"
          aria-labelledby="ws-editor-reset-heading"
          aria-describedby="ws-editor-reset-description"
          onKeyDown={(event: ReactKeyboardEvent) => {
            if (event.key === 'Escape') {
              restoreResetFocus.current = true
              setConfirmingReset(false)
            }
          }}
        >
          <p id="ws-editor-reset-heading">
            <strong>Reset the layout?</strong>
          </p>
          <p id="ws-editor-reset-description" className="ws-muted">
            Puts every word back where it was when this version started. Its name and word pool (including manually added
            words) are kept. You can undo this.
          </p>
          <div className="ws-publish__actions">
            <button type="button" className="ws-button ws-button--danger" onClick={handleReset}>
              Reset Layout
            </button>
            <button
              type="button"
              className="ws-button ws-button--secondary"
              ref={resetCancelRef}
              onClick={() => {
                restoreResetFocus.current = true
                setConfirmingReset(false)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="ws-editor__body">
        <div className="ws-editor__board">
          <div className="ws-editor__view" role="group" aria-label="Board view">
            <button type="button" className="ws-editor__toggle" aria-pressed={view === 'current'} onClick={() => setView('current')}>
              Current
            </button>
            <button
              type="button"
              className="ws-editor__toggle"
              aria-pressed={view === 'original'}
              onClick={() => {
                setView('original')
                setOperation(null)
                setPreview(null)
              }}
            >
              Original
            </button>
          </div>
          {view === 'original' ? (
            <>
              <p className="ws-final__notice" role="status">
                <strong>Viewing the original generated layout (read-only).</strong> Choose Current to keep editing.
              </p>
              <EditorBoard
                words={shownWords}
                label={boardLabel(edit.original, originalNumbers, `Original layout of ${edit.sourceLabel}`)}
                interactive={false}
              />
            </>
          ) : (
            <EditorBoard
              words={words}
              label={boardLabel(words, numbers, name)}
              interactive
              selectedId={selectedId}
              placing={boardPlacement}
              preview={preview}
              onCellClick={handleCellClick}
              onPreview={setPreview}
            />
          )}
          <p className="ws-editor__preview" aria-hidden="true">
            {boardPlacement && preview && previewCheck
              ? previewCheck.ok
                ? `✓ ${boardPlacement.placement.word} ${directionName(direction)} at ${cellName(preview.x, preview.y)} fits · crosses ${previewCheck.crossings} ${previewCheck.crossings === 1 ? 'word' : 'words'}`
                : `✕ ${previewCheck.reason}`
              : ' '}
          </p>
          <p className={notice?.tone === 'error' ? 'ws-publish__problem' : 'ws-muted ws-editor__notice'} role="status">
            {notice?.text}
          </p>
        </div>

        <div className="ws-editor__tools">
          {validation}

          {(operation?.kind === 'add' || operation?.kind === 'move') && placing && (
            <section className="ws-editor__placing" aria-labelledby="ws-editor-placing-heading">
              <h3 id="ws-editor-placing-heading" className="ws-detail__subheading">
                {operation.kind === 'add' ? 'Placing' : 'Moving'} {placing.word}
              </h3>
              <div className="ws-editor__view" role="group" aria-label="Direction">
                {(['across', 'down'] as const).map((each) => (
                  <button
                    key={each}
                    type="button"
                    className="ws-editor__toggle"
                    aria-pressed={direction === each}
                    aria-keyshortcuts={each === 'across' ? 'A' : 'D'}
                    onClick={() => setDirection(each)}
                  >
                    {directionName(each)} ({each === 'across' ? 'A' : 'D'})
                  </button>
                ))}
              </div>
              <p role="status">
                {suggestedCount > 0
                  ? `${suggestedCount} suggested ${suggestedCount === 1 ? 'position' : 'positions'} ${directionName(direction)}, marked with a dot.`
                  : words.filter((word) => word.id !== placing.excludeId).length === 0
                    ? `${placing.word} doesn’t fit ${directionName(direction)} anywhere.`
                    : `No connected ${directionName(direction)} positions for ${placing.word}. You can still place it by hand on any cell where it fits; it won’t be connected yet.`}
              </p>
              <button type="button" className="ws-button ws-button--secondary" onClick={() => cancelOperation()} aria-keyshortcuts="Escape">
                Cancel (Esc)
              </button>
            </section>
          )}

          {selected && operation?.kind !== 'add' && operation?.kind !== 'move' && (
            <section className="ws-editor__selected" aria-labelledby="ws-editor-selected-heading">
              <h3 id="ws-editor-selected-heading" className="ws-detail__subheading">
                Selected: {selected.word}
              </h3>
              <p className="ws-muted">
                {numbers.get(selected.id)} {directionName(selected.direction)} · starts at {cellName(selected.start.x, selected.start.y)} ·{' '}
                {crossings} {crossings === 1 ? 'crossing' : 'crossings'}
              </p>
              {operation?.kind === 'replace' ? (
                <>
                  <p>
                    Choose a replacement from the unused words below, or enter a new answer. It goes in the same place and
                    direction.
                  </p>
                  <button type="button" className="ws-button ws-button--secondary" onClick={() => cancelOperation()} aria-keyshortcuts="Escape">
                    Cancel Replace (Esc)
                  </button>
                </>
              ) : (
                <div className="ws-publish__actions">
                  <button
                    type="button"
                    className="ws-button ws-button--secondary"
                    onClick={() => {
                      setDirection(selected.direction)
                      setOperation({ kind: 'move', id: selected.id })
                      setNotice({ tone: 'info', text: `Moving ${selected.word}. Choose a new starting cell, or press Escape to cancel.` })
                    }}
                  >
                    Move Word
                  </button>
                  <button
                    type="button"
                    className="ws-button ws-button--secondary"
                    onClick={() => {
                      setOperation({ kind: 'replace', id: selected.id })
                      setNotice({ tone: 'info', text: `Replacing ${selected.word}. Choose a replacement word.` })
                    }}
                  >
                    Replace Word
                  </button>
                  <button type="button" className="ws-button ws-button--secondary" onClick={handleRemove} aria-keyshortcuts="Delete Backspace">
                    Remove Word
                  </button>
                </div>
              )}
            </section>
          )}

          {placedList}

          <section aria-labelledby="ws-editor-unused-heading">
            <h3 id="ws-editor-unused-heading" className="ws-detail__subheading">
              Unused words ({unused.length})
            </h3>
            <p className="ws-muted">
              {operation?.kind === 'replace'
                ? 'Choose the replacement.'
                : 'Choose a word to place it. The number is how many connected positions it has (Across and Down).'}
            </p>
            <div className="ws-field">
              <label htmlFor="ws-editor-search">Search unused words</label>
              <input id="ws-editor-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            {filteredUnused.length === 0 ? (
              <p className="ws-muted">{unused.length === 0 ? 'Every word in the pool is on the board.' : 'No unused words match.'}</p>
            ) : (
              <ul className="ws-editor__list">
                {filteredUnused.map((entry) => {
                  const count = counts.get(entry.word) ?? 0
                  const active = operation?.kind === 'add' && operation.word === entry.word
                  return (
                    <li key={entry.word}>
                      <button
                        type="button"
                        className="ws-editor__word"
                        aria-pressed={operation?.kind === 'replace' ? undefined : active}
                        onClick={() => (operation?.kind === 'replace' ? handleReplace(entry.word) : startAdd(entry.word))}
                      >
                        <span className="ws-editor__word-text">{entry.word}</span>
                        {entry.source === 'manual' && <span className="ws-editor__word-tag">Manually Added</span>}
                        <span className="ws-editor__word-count">
                          {count} {count === 1 ? 'placement' : 'placements'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <form className="ws-editor__manual" onSubmit={handleManualSubmit}>
              <div className="ws-field">
                <label htmlFor="ws-editor-manual">New answer</label>
                <input
                  id="ws-editor-manual"
                  value={manual}
                  onChange={(event) => setManual(event.target.value)}
                  aria-invalid={manualError ? true : undefined}
                  aria-describedby={manualError ? 'ws-editor-manual-error' : 'ws-editor-manual-hint'}
                />
              </div>
              <button type="submit" className="ws-button ws-button--secondary">
                {operation?.kind === 'replace' ? 'Add and Replace' : 'Add Word'}
              </button>
              {manualError ? (
                <p id="ws-editor-manual-error" className="ws-field__error" role="alert">
                  {manualError}
                </p>
              ) : (
                <p id="ws-editor-manual-hint" className="ws-muted">
                  Added to this candidate’s word pool only (marked Manually Added), not to Author.
                </p>
              )}
            </form>
          </section>

          <p className="ws-muted ws-editor__shortcuts">
            Shortcuts: Escape cancels · A / D choose Across / Down · Delete removes the selected word · ⌘/Ctrl+Z undo ·
            ⌘/Ctrl+Shift+Z redo.
          </p>
        </div>
      </div>
    </section>
  )
}
