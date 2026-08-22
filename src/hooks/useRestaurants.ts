import { useEffect, useMemo, useState } from 'react'
import { fetchRestaurants, type RestaurantTarget } from '../api/restaurants'
import { restaurants as fixtureRestaurants } from '../data/restaurants'
import type { Restaurant, RestaurantSummary } from '../features/restaurants/types'

const browseCacheKey = 'scoreScout:lastBrowseRestaurants:v2'
// Austin's inspection data is imported at most once a day (see import-austin.mts),
// so a cache within this window is refetched on a timer, not on every visit —
// clearing a search or reopening the app a few minutes later needs no round trip.
const browseCacheMaxAgeMs = 15 * 60 * 1000

interface BrowseCache {
  restaurants: RestaurantSummary[]
  cachedAt: number
}

// Only the default, unfiltered browse view is cached — a search or a
// specific target has no equivalent "last known" list worth showing.
function isDefaultBrowse(trimmed: string, includeAllFacilities: boolean, targetRouteId?: string, targetFacilityId?: string) {
  return !trimmed && !includeAllFacilities && !targetRouteId && !targetFacilityId
}

function readBrowseCache(): BrowseCache | null {
  try {
    const raw = localStorage.getItem(browseCacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BrowseCache>
    return Array.isArray(parsed.restaurants) && typeof parsed.cachedAt === 'number'
      ? { restaurants: parsed.restaurants, cachedAt: parsed.cachedAt }
      : null
  } catch {
    return null
  }
}

function isBrowseCacheFresh(cache: BrowseCache) {
  return Date.now() - cache.cachedAt < browseCacheMaxAgeMs
}

function writeBrowseCache(restaurants: RestaurantSummary[]) {
  try {
    localStorage.setItem(browseCacheKey, JSON.stringify({ restaurants, cachedAt: Date.now() } satisfies BrowseCache))
  } catch {
    // Quota exceeded or storage disabled (e.g. private browsing) — the cache is a
    // nice-to-have, so silently skip rather than surfacing an error to the user.
  }
}

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
//
// `searchQuery` is expected to already be debounced by the caller (see
// useDebouncedValue) — this hook just fetches whenever its params change, so a
// keystroke never has to wait on this effect's own setTimeout/AbortController churn.
export function useRestaurants(searchQuery: string, includeAllFacilities: boolean, target: RestaurantTarget = {}) {
  const { routeId: targetRouteId, facilityId: targetFacilityId } = target
  const fixtureSummaries = useMemo(() => fixtureRestaurants.map(toSummary), [])
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>(() =>
    isDefaultBrowse(searchQuery.trim(), includeAllFacilities, targetRouteId, targetFacilityId) ? readBrowseCache()?.restaurants ?? [] : [],
  )
  const [source, setSource] = useState<'fixture' | 'live'>('fixture')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const trimmed = searchQuery.trim()
    const isBrowse = isDefaultBrowse(trimmed, includeAllFacilities, targetRouteId, targetFacilityId)
    const controller = new AbortController()
    // Deferred a tick (not a debounce — searchQuery is already debounced by the
    // caller) so setLoading isn't called synchronously within the effect body.
    const timeoutId = setTimeout(() => {
      const cached = isBrowse ? readBrowseCache() : null
      if (cached && isBrowseCacheFresh(cached)) {
        // Recent enough that revalidating would just be a wasted round trip for
        // data that changes once a day — reuse it outright, no fetch at all.
        setRestaurants(cached.restaurants)
        setSource('live')
        setLoading(false)
        return
      }
      setLoading(true)
      // Returning to the default view (e.g. clearing a search) with a *stale*
      // cache would otherwise sit on the old, smaller result set until this full
      // re-fetch completes. Restore the last known-good list immediately instead,
      // then let the fetch below quietly replace it once fresh data arrives.
      if (cached) {
        setRestaurants(cached.restaurants)
        setSource('live')
      }
      fetchRestaurants(trimmed || undefined, includeAllFacilities, { routeId: targetRouteId, facilityId: targetFacilityId }, controller.signal)
        .then((liveRestaurants) => {
          if (liveRestaurants.length || trimmed) {
            setRestaurants(liveRestaurants)
            setSource('live')
            if (isBrowse) writeBrowseCache(liveRestaurants)
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
    }, 0)
    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [searchQuery, includeAllFacilities, targetRouteId, targetFacilityId, fixtureSummaries])

  return { restaurants, source, loading }
}
