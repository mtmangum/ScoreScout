import { describe, expect, it } from 'vitest'
import { restaurants } from '../data/restaurants'
import { parseStoredFavorites } from './useFavorites'

describe('parseStoredFavorites', () => {
  it('preserves legacy ID-only favorites for API hydration', () => {
    expect(parseStoredFavorites('["one","two","one",3]')).toEqual({ ids: ['one', 'two'], restaurants: [] })
  })

  it('retains valid snapshots for saved IDs only, normalizing legacy full-Restaurant snapshots to the summary shape', () => {
    const restaurant = restaurants[0]
    const removed = { ...restaurant, id: 'removed' }
    const { ids, restaurants: parsed } = parseStoredFavorites(JSON.stringify({
      version: 2,
      ids: [restaurant.id],
      restaurants: [restaurant, removed, { id: 'broken' }],
    }))
    expect(ids).toEqual([restaurant.id])
    expect(parsed).toEqual([{
      id: restaurant.id, name: restaurant.name, cityCode: restaurant.cityCode, routeId: restaurant.routeId, facilityId: restaurant.facilityId,
      routeAliases: undefined, facilityAliases: undefined, facilityCategory: undefined,
      latitude: restaurant.latitude, longitude: restaurant.longitude,
      profileScore: restaurant.profile.score, latestInspection: { score: restaurant.inspections[0].score, date: restaurant.inspections[0].date },
    }])
  })

  it('recovers safely from malformed storage', () => {
    expect(parseStoredFavorites('{not json')).toEqual({ ids: [], restaurants: [] })
  })
})
