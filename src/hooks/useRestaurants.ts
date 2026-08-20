import { useEffect, useMemo, useState } from 'react'
import { fetchRestaurants, type RestaurantTarget } from '../api/restaurants'
import { restaurants as fixtureRestaurants } from '../data/restaurants'
import type { Restaurant, RestaurantSummary } from '../features/restaurants/types'

const searchDebounceMs = 300

function toSummary(restaurant: Restaurant): RestaurantSummary {
  return {
    id: restaurant.id,
    cityCode: restaurant.cityCode,
    routeId: restaurant.routeId,
    facilityId: restaurant.facilityId,
    routeAliases: restaurant.routeAliases,
    facilityAliases: restaurant.facilityAliases,
    facilityCategory: restaurant.facilityCategory,
    name: restaurant.name,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    profileScore: restaurant.profile.score,
    latestInspection: { score: restaurant.inspections[0].score, date: restaurant.inspections[0].date },
  }
}

// The API returns every matching restaurant as a lightweight summary (no arbitrary
// page cap), so map coverage, list sorting, and score filtering all see the full
// matching population. Full detail is fetched separately once a card is opened.
export function useRestaurants(searchQuery: string, includeAllFacilities: boolean, target: RestaurantTarget = {}) {
  const { routeId: targetRouteId, facilityId: targetFacilityId } = target
  const fixtureSummaries = useMemo(() => fixtureRestaurants.map(toSummary), [])
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>(fixtureSummaries)
  const [source, setSource] = useState<'fixture' | 'live'>('fixture')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const trimmed = searchQuery.trim()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      setLoading(true)
      fetchRestaurants(trimmed || undefined, includeAllFacilities, { routeId: targetRouteId, facilityId: targetFacilityId }, controller.signal)
        .then((liveRestaurants) => {
          if (liveRestaurants.length || trimmed) {
            setRestaurants(liveRestaurants)
            setSource('live')
          } else {
            setRestaurants(fixtureSummaries)
            setSource('fixture')
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setRestaurants(fixtureSummaries)
          setSource('fixture')
        })
        .finally(() => setLoading(false))
    }, trimmed ? searchDebounceMs : 0)
    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [searchQuery, includeAllFacilities, targetRouteId, targetFacilityId, fixtureSummaries])

  return { restaurants, source, loading }
}
