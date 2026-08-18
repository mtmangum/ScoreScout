import { describe, expect, it } from 'vitest'
import { restaurants } from '../data/restaurants'
import { parseStoredFavorites } from './useFavorites'

describe('parseStoredFavorites', () => {
  it('preserves legacy ID-only favorites for API hydration', () => {
    expect(parseStoredFavorites('["one","two","one",3]')).toEqual({ ids: ['one', 'two'], restaurants: [] })
  })

  it('retains valid snapshots for saved IDs only', () => {
    const restaurant = restaurants[0]
    const removed = { ...restaurant, id: 'removed' }
    expect(parseStoredFavorites(JSON.stringify({
      version: 2,
      ids: [restaurant.id],
      restaurants: [restaurant, removed, { id: 'broken' }],
    }))).toEqual({ ids: [restaurant.id], restaurants: [restaurant] })
  })

  it('recovers safely from malformed storage', () => {
    expect(parseStoredFavorites('{not json')).toEqual({ ids: [], restaurants: [] })
  })
})
