import { describe, expect, it } from 'vitest'
import { composeRestaurantList, mergeRestaurantSources } from './favoriteRestaurants'
import type { Restaurant } from './types'

const restaurant = (id: string, name = id) => ({ id, name } as Restaurant)

describe('favorite restaurant composition', () => {
  it('keeps saved snapshots when the current API page does not contain them', () => {
    expect(mergeRestaurantSources([restaurant('browse')], [restaurant('saved')]).map(({ id }) => id))
      .toEqual(['saved', 'browse'])
  })

  it('prefers current API data when refreshing a saved snapshot', () => {
    const merged = mergeRestaurantSources([restaurant('saved', 'Current')], [restaurant('saved', 'Snapshot')])
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('Current')
  })

  it('pins every saved restaurant regardless of the current browse results', () => {
    const saved = [restaurant('saved')]
    const browse = [restaurant('other')]
    expect(composeRestaurantList(saved, browse, new Set(['saved']), false).map(({ id }) => id))
      .toEqual(['saved', 'other'])
    expect(composeRestaurantList(saved, [], new Set(['saved']), false).map(({ id }) => id))
      .toEqual(['saved'])
  })

  it('does not duplicate saved restaurants already present in browse results', () => {
    const saved = [restaurant('saved')]
    expect(composeRestaurantList(saved, [restaurant('saved'), restaurant('other')], new Set(['saved']), false).map(({ id }) => id))
      .toEqual(['saved', 'other'])
  })
})
