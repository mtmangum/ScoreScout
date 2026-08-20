import { useEffect, useState } from 'react'
import { fetchRestaurantDetail } from '../api/restaurants'
import { restaurants as fixtureRestaurants } from '../data/restaurants'
import type { Restaurant, RestaurantSummary } from '../features/restaurants/types'

const detailCacheLimit = 20

// A specific restaurant's full record (inspection history, profile breakdown,
// community rating) is fetched only once it's selected, rather than carried by
// every row in the browse/search list. `liveDetails` doubles as a small cache,
// so re-selecting a restaurant already seen this session doesn't refetch it.
export function useRestaurantDetail(selected: RestaurantSummary | null, source: 'fixture' | 'live') {
  const [liveDetails, setLiveDetails] = useState<Map<string, Restaurant | null>>(() => new Map())

  useEffect(() => {
    if (!selected || source === 'fixture' || liveDetails.has(selected.id)) return
    const controller = new AbortController()
    fetchRestaurantDetail(selected.id, controller.signal)
      .then((restaurant) => {
        setLiveDetails((current) => {
          const next = new Map(current)
          next.set(selected.id, restaurant)
          if (next.size > detailCacheLimit) next.delete(next.keys().next().value as string)
          return next
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLiveDetails((current) => new Map(current).set(selected.id, null))
      })
    return () => controller.abort()
  }, [selected, source, liveDetails])

  if (!selected) return { detail: null, loading: false }
  if (source === 'fixture') return { detail: fixtureRestaurants.find(({ id }) => id === selected.id) ?? null, loading: false }
  return { detail: liveDetails.get(selected.id) ?? null, loading: !liveDetails.has(selected.id) }
}
