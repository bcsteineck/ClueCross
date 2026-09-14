// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StarRating } from './StarRating'

afterEach(cleanup)

describe('StarRating', () => {
  it('renders an accessible label describing the rating out of 3', () => {
    render(<StarRating count={2} />)
    expect(screen.getByRole('img', { name: '2 out of 3 stars' })).toBeTruthy()
  })

  it('renders exactly 3 star icons regardless of count', () => {
    const { container } = render(<StarRating count={1} />)
    expect(container.querySelectorAll('.star-rating__star')).toHaveLength(3)
  })

  it('fills exactly `count` stars, left to right', () => {
    const { container } = render(<StarRating count={2} />)
    const stars = container.querySelectorAll('.star-rating__star')
    expect(stars[0].getAttribute('fill')).toBe('currentColor')
    expect(stars[1].getAttribute('fill')).toBe('currentColor')
    expect(stars[2].getAttribute('fill')).toBe('none')
  })

  it('renders all 3 icons unfilled for a 0 rating, rather than omitting them', () => {
    const { container } = render(<StarRating count={0} />)
    const stars = container.querySelectorAll('.star-rating__star')
    expect(stars).toHaveLength(3)
    expect(Array.from(stars).every((star) => star.getAttribute('fill') === 'none')).toBe(true)
  })

  it('fills all 3 stars for a full rating', () => {
    const { container } = render(<StarRating count={3} />)
    const stars = container.querySelectorAll('.star-rating__star')
    expect(Array.from(stars).every((star) => star.getAttribute('fill') === 'currentColor')).toBe(
      true,
    )
  })
})
