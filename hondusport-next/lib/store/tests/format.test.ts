import { describe, it, expect } from 'vitest'
import { formatPrice, getBadgeColor, getDiscountPercent } from '../format'

describe('formatPrice', () => {
  it('formats zero with two decimals', () => {
    expect(formatPrice(0)).toBe('L. 0.00')
  })

  it('formats decimals and thousands separators', () => {
    expect(formatPrice(1234.5)).toBe('L. 1,234.50')
  })
})

describe('getBadgeColor', () => {
  it('returns the mapped color for known badges', () => {
    expect(getBadgeColor('Oferta')).toBe('#E74C3C')
    expect(getBadgeColor('Nuevo')).toBe('#27AE60')
  })

  it('falls back to the default color for unknown badges', () => {
    expect(getBadgeColor('Edición Especial')).toBe('#E74C3C')
  })
})

describe('getDiscountPercent', () => {
  it('returns null when there is no original price', () => {
    expect(getDiscountPercent(100, null)).toBeNull()
  })

  it('returns null when original price is not greater than current price', () => {
    expect(getDiscountPercent(100, 100)).toBeNull()
    expect(getDiscountPercent(120, 100)).toBeNull()
  })

  it('calculates the rounded discount percentage', () => {
    expect(getDiscountPercent(75, 100)).toBe(25)
    expect(getDiscountPercent(66, 100)).toBe(34)
  })
})
