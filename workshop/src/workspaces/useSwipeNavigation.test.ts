import { describe, expect, it } from 'vitest'
import { SWIPE_MIN_DISTANCE, classifySwipe } from './useSwipeNavigation'

describe('classifySwipe', () => {
  it('reads a deliberate horizontal movement: left is Next, right is Previous', () => {
    expect(classifySwipe(-SWIPE_MIN_DISTANCE, 0)).toBe('next')
    expect(classifySwipe(SWIPE_MIN_DISTANCE, 0)).toBe('previous')
    expect(classifySwipe(-100, 40)).toBe('next')
  })

  it('ignores short, vertical, and diagonal movement', () => {
    expect(classifySwipe(-(SWIPE_MIN_DISTANCE - 1), 0)).toBeNull()
    expect(classifySwipe(0, -300)).toBeNull()
    expect(classifySwipe(-100, 60)).toBeNull()
    expect(classifySwipe(0, 0)).toBeNull()
  })
})
