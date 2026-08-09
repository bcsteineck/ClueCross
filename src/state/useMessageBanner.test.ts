// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMessageBanner } from './useMessageBanner'

afterEach(cleanup)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useMessageBanner', () => {
  it('starts with no message', () => {
    const { result } = renderHook(() => useMessageBanner())
    expect(result.current.message).toBeNull()
  })

  it('shows a message when told to', () => {
    const { result } = renderHook(() => useMessageBanner())
    act(() => result.current.showMessage('Hello'))
    expect(result.current.message).toBe('Hello')
  })

  it('auto-dismisses after 20 seconds', () => {
    const { result } = renderHook(() => useMessageBanner())
    act(() => result.current.showMessage('Hello'))

    act(() => vi.advanceTimersByTime(19_999))
    expect(result.current.message).toBe('Hello')

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.message).toBeNull()
  })

  it('dismiss() clears the message immediately', () => {
    const { result } = renderHook(() => useMessageBanner())
    act(() => result.current.showMessage('Hello'))
    act(() => result.current.dismiss())
    expect(result.current.message).toBeNull()
  })

  it('a new message replaces the current one and restarts the timer', () => {
    const { result } = renderHook(() => useMessageBanner())
    act(() => result.current.showMessage('First'))
    act(() => vi.advanceTimersByTime(15_000))
    act(() => result.current.showMessage('Second'))

    // The first message's timer would have fired by now had it not been
    // superseded — confirms the new message reset the 20s window rather
    // than inheriting the first one's remaining time.
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.message).toBe('Second')

    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.message).toBeNull()
  })

  it('dismiss() before any message is shown is a no-op', () => {
    const { result } = renderHook(() => useMessageBanner())
    act(() => result.current.dismiss())
    expect(result.current.message).toBeNull()
  })
})
