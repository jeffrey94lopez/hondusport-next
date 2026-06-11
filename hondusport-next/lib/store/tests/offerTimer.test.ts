import { describe, expect, test } from 'vitest'
import { getOfferSecondsRemaining } from '../offerTimer'

describe('getOfferSecondsRemaining', () => {
  test('returns 0 when ofertaFin is null', () => {
    expect(getOfferSecondsRemaining(null, new Date('2026-01-01T00:00:00Z'))).toBe(0)
  })

  test('returns 0 when ofertaFin is in the past', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    expect(getOfferSecondsRemaining('2026-01-01T11:00:00Z', now)).toBe(0)
  })

  test('returns remaining seconds when ofertaFin is in the future', () => {
    const now = new Date('2026-01-01T12:00:00Z')
    expect(getOfferSecondsRemaining('2026-01-01T13:00:00Z', now)).toBe(3600)
  })

  test('rounds down to whole seconds', () => {
    const now = new Date('2026-01-01T12:00:00.000Z')
    expect(getOfferSecondsRemaining('2026-01-01T12:00:01.500Z', now)).toBe(1)
  })
})
