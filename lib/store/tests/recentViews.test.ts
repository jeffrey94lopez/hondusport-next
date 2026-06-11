import { describe, it, expect } from 'vitest'
import { addRecentView, MAX_RECENT_VIEWS } from '../recentViews'

describe('addRecentView', () => {
  it('adds a new id to the front of an empty list', () => {
    expect(addRecentView([], 'p1')).toEqual(['p1'])
  })

  it('moves an existing id to the front instead of duplicating it', () => {
    expect(addRecentView(['p2', 'p1', 'p3'], 'p1')).toEqual(['p1', 'p2', 'p3'])
  })

  it('caps the list at MAX_RECENT_VIEWS entries', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    expect(addRecentView(ids, 'p7')).toEqual(['p7', 'p1', 'p2', 'p3', 'p4', 'p5'])
    expect(addRecentView(ids, 'p7')).toHaveLength(MAX_RECENT_VIEWS)
  })
})
