import { describe, expect, it } from 'vitest'
import { resolveSelectedRestaurant } from './resolveSelectedRestaurant'
import type { Restaurant } from './types'

function makeRestaurant(overrides: Partial<Restaurant> & Pick<Restaurant, 'id' | 'facilityId' | 'routeId'>): Restaurant {
  return {
    cityCode: 'AUS',
    name: `Restaurant ${overrides.id}`,
    address: '1 Test St, Austin, TX',
    latitude: 30.27,
    longitude: -97.74,
    inspections: [{ id: 'i1', date: '2026-01-01', score: 90, processDescription: 'Routine Inspection' }],
    profile: { score: 90, confidence: 'Limited', weightedHistoryScore: 90, consistencyAdjustment: 0, trendAdjustment: 0 },
    ...overrides,
  }
}

describe('resolveSelectedRestaurant', () => {
  it('matches by exact facilityId, case-insensitively', () => {
    const target = makeRestaurant({ id: '1', facilityId: 'AUS-1001', routeId: '1' })
    const restaurants = [target, makeRestaurant({ id: '2', facilityId: 'AUS-1002', routeId: '2' })]
    expect(resolveSelectedRestaurant(restaurants, { facilityId: 'aus-1001' })).toBe(target)
  })

  it('matches by cityCode + routeId suffix (the canonical /:cityCode/:restaurantKey route)', () => {
    const target = makeRestaurant({ id: '1', facilityId: 'AUS-1001', routeId: '23' })
    const restaurants = [target, makeRestaurant({ id: '2', facilityId: 'AUS-1002', routeId: '24' })]
    expect(resolveSelectedRestaurant(restaurants, { cityCode: 'AUS', restaurantKey: 'juniper-table-23' })).toBe(target)
  })

  it('does not match a route across a different cityCode', () => {
    const target = makeRestaurant({ id: '1', facilityId: 'AUS-1001', routeId: '23', cityCode: 'AUS' })
    const restaurants = [target]
    expect(resolveSelectedRestaurant(restaurants, { cityCode: 'HOU', restaurantKey: 'juniper-table-23' })).toBeNull()
  })

  it('matches the legacy /r/:restaurantKey facilityId-suffix format', () => {
    const target = makeRestaurant({ id: '1', facilityId: 'AUS-1001', routeId: '1' })
    const restaurants = [target, makeRestaurant({ id: '2', facilityId: 'AUS-1002', routeId: '2' })]
    expect(resolveSelectedRestaurant(restaurants, { restaurantKey: 'juniper-table-AUS-1001' })).toBe(target)
  })

  it('is case-insensitive for the legacy facilityId-suffix match', () => {
    const target = makeRestaurant({ id: '1', facilityId: 'AUS-1001', routeId: '1' })
    const restaurants = [target]
    expect(resolveSelectedRestaurant(restaurants, { restaurantKey: 'juniper-table-aus-1001' })).toBe(target)
  })

  it('prefers the longest matching facilityId when one is a suffix of another', () => {
    // Regression test: a naive .find() would return whichever candidate comes first
    // in array order, which could be the shorter, wrong facilityId.
    const shortId = makeRestaurant({ id: 'short', facilityId: '1001', routeId: '1' })
    const longId = makeRestaurant({ id: 'long', facilityId: 'AUS-1001', routeId: '2' })
    expect(resolveSelectedRestaurant([shortId, longId], { restaurantKey: 'juniper-table-AUS-1001' })).toBe(longId)
    expect(resolveSelectedRestaurant([longId, shortId], { restaurantKey: 'juniper-table-AUS-1001' })).toBe(longId)
  })

  it('returns null when nothing matches', () => {
    const restaurants = [makeRestaurant({ id: '1', facilityId: 'AUS-1001', routeId: '1' })]
    expect(resolveSelectedRestaurant(restaurants, { facilityId: 'AUS-9999' })).toBeNull()
    expect(resolveSelectedRestaurant(restaurants, {})).toBeNull()
  })

  // Regression coverage for the production bug where restaurant_explorer derived
  // route_id via lpad(route_number::text, 2, '0'), which truncates (not just pads)
  // any route_number of 3+ digits down to its first two digits — collapsing every
  // route_number sharing a two-digit prefix (e.g. 180, 181, ..., 189, 1800-1899)
  // onto the same route_id and sending clicks to the wrong restaurant. The fix
  // moved to an untruncated route_number::text, but this stress test guards the
  // *client* matching logic itself against ever silently reintroducing a
  // routeId-suffix collision, independent of what the server happens to send.
  it('resolves every restaurant correctly across a large, realistic set of numeric routeIds', () => {
    const routeIds = [
      '1', '5', '9', '10', '18', '99', '100', '105', '180', '181', '183', '184', '189',
      '1800', '1821', '1849', '1899', '2500', '6500', '6511',
    ]
    const restaurants = routeIds.map((routeId, index) =>
      makeRestaurant({ id: `r-${routeId}`, facilityId: `AUS-${1000 + index}`, routeId, name: `Spot ${routeId}` }),
    )
    for (const restaurant of restaurants) {
      const key = `spot-${restaurant.routeId}-${restaurant.routeId}`
      const resolved = resolveSelectedRestaurant(restaurants, { cityCode: 'AUS', restaurantKey: key })
      expect(resolved?.id).toBe(restaurant.id)
    }
  })
})
