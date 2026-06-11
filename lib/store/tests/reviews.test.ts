import { describe, it, expect } from 'vitest'
import { getReviews } from '../reviews'

describe('getReviews', () => {
  it('returns a single review when rating is below 4', () => {
    expect(getReviews(3)).toHaveLength(1)
  })

  it('returns two reviews when rating is 4 or higher', () => {
    expect(getReviews(4)).toHaveLength(2)
    expect(getReviews(5)).toHaveLength(2)
  })

  it('each review has an author and text', () => {
    for (const review of getReviews(5)) {
      expect(review.author).toBeTruthy()
      expect(review.text).toBeTruthy()
    }
  })
})
