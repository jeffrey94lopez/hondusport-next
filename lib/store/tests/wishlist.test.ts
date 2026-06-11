import { describe, it, expect } from 'vitest'
import { toggleWishlist } from '../wishlist'

describe('toggleWishlist', () => {
  it('adds an id that is not in the list', () => {
    expect(toggleWishlist([], 'p1')).toEqual(['p1'])
  })

  it('removes an id that is already in the list', () => {
    expect(toggleWishlist(['p1', 'p2'], 'p1')).toEqual(['p2'])
  })
})
