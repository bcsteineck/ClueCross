import './ArchiveCalendarKey.scss'

// The calendar key (left) and the release-time note (right). The color
// swatches are purely decorative — they restate what the "Completed"/
// "Selected" text already says, so they're hidden from assistive tech.
export function ArchiveCalendarKey() {
  return (
    <div className="archive-calendar-key">
      <div className="archive-calendar-key__items">
        <div className="archive-calendar-key__item">
          <span className="archive-calendar-key__swatch archive-calendar-key__swatch--completed" aria-hidden="true" />
          <span className="archive-calendar-key__label">Completed</span>
        </div>
        <div className="archive-calendar-key__item">
          <span className="archive-calendar-key__swatch archive-calendar-key__swatch--selected" aria-hidden="true" />
          <span className="archive-calendar-key__label">Selected</span>
        </div>
      </div>
      <p className="archive-calendar-key__note">New puzzle published daily at 10:00 PM EST</p>
    </div>
  )
}
