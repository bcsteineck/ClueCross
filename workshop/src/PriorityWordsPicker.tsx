import { MAX_PRIORITY_WORDS, missingPriorityWords } from './priorityWords'

interface PriorityWordsPickerProps {
  /** The active mode's usable pool (construction form): the only words that can be chosen. */
  words: string[]
  /** The active mode's selections, including any no longer in the pool. */
  selected: string[]
  /** Set when the author just tried to select past the limit. */
  limitReached: boolean
  onToggle: (word: string) => void
  onRemove: (word: string) => void
}

// Priority Words picker: one checkbox per usable word. At the limit the
// unselected boxes stay focusable but are marked aria-disabled and point to
// the limit message, which also explains a refused selection. Selections no
// longer in the pool are listed separately with an explicit Remove.
export function PriorityWordsPicker({ words, selected, limitReached, onToggle, onRemove }: PriorityWordsPickerProps) {
  const missing = missingPriorityWords(selected, words)
  const atLimit = selected.length >= MAX_PRIORITY_WORDS

  return (
    <fieldset className="ws-field ws-priority" aria-describedby="ws-priority-hint">
      <legend>
        Priority Words{' '}
        <span className="ws-priority__count">
          ({selected.length} of {MAX_PRIORITY_WORDS} selected)
        </span>
      </legend>
      <p id="ws-priority-hint" className="ws-muted">
        Select up to {MAX_PRIORITY_WORDS} words that must appear in every generated puzzle. They come from the candidate
        list above; selecting one doesn’t add it again.
      </p>

      {words.length > 0 ? (
        <ul className="ws-priority__options">
          {words.map((word) => {
            const checked = selected.includes(word)
            const unavailable = atLimit && !checked
            return (
              <li key={word}>
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-disabled={unavailable || undefined}
                    aria-describedby={unavailable ? 'ws-priority-limit' : undefined}
                    onChange={() => onToggle(word)}
                  />{' '}
                  {word}
                </label>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="ws-muted">No usable candidate words yet.</p>
      )}

      {selected.length > 0 && <p className="ws-priority__selected">Selected: {selected.join(', ')}</p>}

      {missing.length > 0 && (
        <div className="ws-priority__missing">
          <p>Not in the candidate list:</p>
          <ul>
            {missing.map((word) => (
              <li key={word}>
                <span>{word}</span>
                <button
                  type="button"
                  className="ws-button ws-button--secondary"
                  aria-label={`Remove ${word} from Priority Words`}
                  onClick={() => onRemove(word)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(atLimit || limitReached) && (
        <p id="ws-priority-limit" className="ws-muted" role="status">
          {limitReached
            ? `Not selected: you can choose at most ${MAX_PRIORITY_WORDS} Priority Words. Deselect one to choose another.`
            : `Maximum of ${MAX_PRIORITY_WORDS} Priority Words selected. Deselect one to choose another.`}
        </p>
      )}
    </fieldset>
  )
}
