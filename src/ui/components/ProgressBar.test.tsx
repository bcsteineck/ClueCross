// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProgressBar } from './ProgressBar'

afterEach(cleanup)

describe('ProgressBar', () => {
  it('shows the filled/total fraction and percentage', () => {
    render(<ProgressBar progress={{ filled: 42, total: 109, percent: 39 }} />)
    expect(screen.getByText('42 / 109 cells filled')).toBeTruthy()
    expect(screen.getByText('39%')).toBeTruthy()
  })

  it('exposes the percentage via an accessible progressbar role', () => {
    render(<ProgressBar progress={{ filled: 42, total: 109, percent: 39 }} />)
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('39')
    expect(bar.getAttribute('aria-valuemin')).toBe('0')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
  })

  it('sizes the fill element to the percentage', () => {
    const { container } = render(<ProgressBar progress={{ filled: 5, total: 10, percent: 50 }} />)
    const fill = container.querySelector('.progress-bar__fill') as HTMLElement
    expect(fill.style.width).toBe('50%')
  })

  it('renders 0% with an empty fill rather than erroring', () => {
    const { container } = render(<ProgressBar progress={{ filled: 0, total: 10, percent: 0 }} />)
    const fill = container.querySelector('.progress-bar__fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })
})
