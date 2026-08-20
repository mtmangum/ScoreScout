import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchRestaurantsByIds } from '../api/restaurants'
import type { RestaurantSummary } from '../features/restaurants/types'

const storageKey = 'scorescout-favorite-restaurants'

interface FavoriteState {
  ids: string[]
  restaurants: RestaurantSummary[]
}

// Accepts both the current flat summary shape and the pre-migration full
// `Restaurant` shape (nested `profile.score` / `inspections[0]`), so favorites
// saved by an older build of the app still survive this parse.
function toSummary(value: unknown): RestaurantSummary | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' ||
    typeof candidate.cityCode !== 'string' || typeof candidate.routeId !== 'string' ||
    typeof candidate.facilityId !== 'string' ||
    typeof candidate.latitude !== 'number' || typeof candidate.longitude !== 'number') return null

  const legacyProfile = candidate.profile as { score?: unknown } | undefined
  const profileScore = typeof candidate.profileScore === 'number' ? candidate.profileScore : legacyProfile?.score
  const legacyInspections = candidate.inspections as Array<{ score?: unknown; date?: unknown }> | undefined
  const latestInspection = (candidate.latestInspection as { score?: unknown; date?: unknown } | undefined) ?? legacyInspections?.[0]
  if (typeof profileScore !== 'number' || !latestInspection ||
    typeof latestInspection.score !== 'number' || typeof latestInspection.date !== 'string') return null

  return {
    id: candidate.id, name: candidate.name, cityCode: candidate.cityCode, routeId: candidate.routeId, facilityId: candidate.facilityId,
    routeAliases: candidate.routeAliases as string[] | undefined, facilityAliases: candidate.facilityAliases as string[] | undefined,
    facilityCategory: candidate.facilityCategory as RestaurantSummary['facilityCategory'],
    latitude: candidate.latitude, longitude: candidate.longitude,
    profileScore, latestInspection: { score: latestInspection.score, date: latestInspection.date },
  }
}

export function parseStoredFavorites(serialized: string | null): FavoriteState {
  try {
    const stored: unknown = JSON.parse(serialized ?? '[]')
    // Version 1 stored only an array of IDs. Keep those IDs so the API can
    // hydrate them into durable snapshots after this release loads.
    if (Array.isArray(stored)) {
      return { ids: [...new Set(stored.filter((id): id is string => typeof id === 'string'))], restaurants: [] }
    }
    if (!stored || typeof stored !== 'object') return { ids: [], restaurants: [] }
    const candidate = stored as { ids?: unknown; restaurants?: unknown }
    const ids = Array.isArray(candidate.ids)
      ? [...new Set(candidate.ids.filter((id): id is string => typeof id === 'string'))]
      : []
    const idSet = new Set(ids)
    const restaurants = Array.isArray(candidate.restaurants)
      ? candidate.restaurants.map(toSummary).filter((restaurant): restaurant is RestaurantSummary => restaurant !== null && idSet.has(restaurant.id))
      : []
    return { ids, restaurants }
  } catch {
    return { ids: [], restaurants: [] }
  }
}

function loadFavorites() {
  try {
    return parseStoredFavorites(localStorage.getItem(storageKey))
  } catch {
    return { ids: [], restaurants: [] }
  }
}

function mergeSnapshots(current: FavoriteState, refreshed: RestaurantSummary[]) {
  const byId = new Map(current.restaurants.map((restaurant) => [restaurant.id, restaurant]))
  refreshed.forEach((restaurant) => {
    if (current.ids.includes(restaurant.id)) byId.set(restaurant.id, restaurant)
  })
  return { ...current, restaurants: current.ids.flatMap((id) => byId.get(id) ?? []) }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteState>(loadFavorites)
  const favoriteIds = useMemo(() => new Set(favorites.ids), [favorites.ids])
  const favoriteRestaurants = useMemo(() => {
    const byId = new Map(favorites.restaurants.map((restaurant) => [restaurant.id, restaurant]))
    return favorites.ids.flatMap((id) => byId.get(id) ?? [])
  }, [favorites])
  const favoriteIdsKey = favorites.ids.join(',')

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ version: 2, ...favorites }))
    } catch {
      // Favorites still work for this session when storage is unavailable.
    }
  }, [favorites])

  useEffect(() => {
    if (!favoriteIdsKey) return
    const ids = favoriteIdsKey.split(',')
    const controller = new AbortController()
    fetchRestaurantsByIds(ids, controller.signal)
      .then((restaurants) => setFavorites((current) => mergeSnapshots(current, restaurants)))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Existing snapshots remain usable when refresh is unavailable.
      })
    return () => controller.abort()
  }, [favoriteIdsKey])

  const toggleFavorite = useCallback((restaurant: RestaurantSummary) => {
    setFavorites((current) => {
      if (current.ids.includes(restaurant.id)) {
        return {
          ids: current.ids.filter((favoriteId) => favoriteId !== restaurant.id),
          restaurants: current.restaurants.filter(({ id }) => id !== restaurant.id),
        }
      }
      return { ids: [...current.ids, restaurant.id], restaurants: [...current.restaurants, restaurant] }
    })
  }, [])

  return { favoriteIds, favoriteRestaurants, toggleFavorite }
}
