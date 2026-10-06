// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RevealButton } from './RevealButton'

afterEach(cleanup)

const dots = (container: HTMLElement) => container.querySelectorAll('.reveal-button__dot')

describe('RevealButton free-reveal dots', () => {
  it('draws one decorative dot per free reveal before the caption', () => {
    const { container } = render(<RevealButton label="Reveal Letter" sublabel="2 free reveals remaining" sublabelDots={2} onClick={() => {}} />)
    expect(dots(container)).toHaveLength(2)
    expect(container.querySelector('.reveal-button__dots')?.getAttribute('aria-hidden')).toBe('true')
    // The dots come first, and the caption text is unchanged for assistive tech.
    const caption = screen.getByText('2 free reveals remaining')
    expect(caption.firstElementChild?.className).toBe('reveal-button__dots')
    expect(caption.textContent).toBe('2 free reveals remaining')
  })

  it('draws no dots when there is no count or no caption', () => {
    expect(dots(render(<RevealButton label="Reveal Letter" sublabel="x" onClick={() => {}} />).container)).toHaveLength(0)
    cleanup()
    expect(dots(render(<RevealButton label="Reveal Letter" sublabelDots={3} onClick={() => {}} />).container)).toHaveLength(0)
  })
})
