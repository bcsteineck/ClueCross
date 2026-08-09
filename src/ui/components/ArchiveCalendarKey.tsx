import './ArchiveCalendarKey.scss'

// Purely decorative — the color swatches restate what the "Completed"/
// "Selected" text already says, so they're hidden from assistive tech.
export function ArchiveCalendarKey() {
  return (
    <div className="archive-calendar-key">
      <div className="archive-calendar-key__item">
        <span className="archive-calendar-key__swatch archive-calendar-key__swatch--completed" aria-hidden="true" />
        <span className="archive-calendar-key__label">Completed</span>
      </div>
      <div className="archive-calendar-key__item">
        <span className="archive-calendar-key__swatch archive-calendar-key__swatch--selected" aria-hidden="true" />
        <span className="archive-calendar-key__label">Selected</span>
      </div>
    </div>
  )
}
