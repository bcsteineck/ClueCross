import { describe, expect, it } from 'vitest'
import { getAwardLevel, getStarCount } from './awardLevel'

describe('getAwardLevel', () => {
  it('is bust for any negative score', () => {
    expect(getAwardLevel(-1)).toBe('bust')
    expect(getAwardLevel(-2000)).toBe('bust')
  })

  it('is bronze from 0 up to 599', () => {
    expect(getAwardLevel(0)).toBe('bronze')
    expect(getAwardLevel(599)).toBe('bronze')
  })

  it('is silver from 600 up to 1199', () => {
    expect(getAwardLevel(600)).toBe('silver')
    expect(getAwardLevel(1199)).toBe('silver')
  })

  it('is gold from 1200 and up', () => {
    expect(getAwardLevel(1200)).toBe('gold')
    expect(getAwardLevel(2000)).toBe('gold')
  })
})

describe('getStarCount', () => {
  it('maps bust to 0 stars', () => {
    expect(getStarCount(-1)).toBe(0)
  })

  it('maps bronze to 1 star', () => {
    expect(getStarCount(0)).toBe(1)
    expect(getStarCount(599)).toBe(1)
  })

  it('maps silver to 2 stars', () => {
    expect(getStarCount(600)).toBe(2)
    expect(getStarCount(1199)).toBe(2)
  })

  it('maps gold to 3 stars', () => {
    expect(getStarCount(1200)).toBe(3)
    expect(getStarCount(2000)).toBe(3)
  })
})
