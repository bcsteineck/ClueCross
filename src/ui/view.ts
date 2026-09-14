// Shared between DesktopLayout and MobileLayout. Desktop's UI only ever
// sets/reads 'puzzle' | 'reveal' | 'archive' (its center column has no
// path to 'stats' or 'howToPlay' — those are always-visible side cards on
// desktop instead); its center-content switch treats any other value as
// 'puzzle', so a view carried over from mobile after a resize degrades
// safely rather than needing special-casing.
export type View = 'puzzle' | 'reveal' | 'archive' | 'stats' | 'howToPlay'
