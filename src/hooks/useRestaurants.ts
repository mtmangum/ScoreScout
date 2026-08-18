import { useEffect, useState } from 'react'
import { fetchRestaurants } from '../api/restaurants'
import { restaurants as fixtureRestaurants } from '../data/restaurants'
import type { Restaurant } from '../features/restaurants/types'

const searchDebounceMs = 300

// The API caps at 1,000 rows with no ordering, so a client-side search over a single
// fetched snapshot can silently miss restaurants outside that arbitrary slice once the
// full dataset grows past it. Re-fetching with the server's own `q` search keeps
// results correct regardless of how large the underlying table gets.
export function useRestaurants(searchQuery: string) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(fixtureRestaurants)
  const [source, setSource] = useState<'fixture' | 'live'>('fixture')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const trimmed = searchQuery.trim()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      setLoading(true)
      fetchRestaurants(trimmed || undefined, controller.signal)
        .then((liveRestaurants) => {
          if (liveRestaurants.length || trimmed) {
            setRestaurants(liveRestaurants)
            setSource('live')
          } else {
            setRestaurants(fixtureRestaurants)
            setSource('fixture')
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setRestaurants(fixtureRestaurants)
          setSource('fixture')
        })
        .finally(() => setLoading(false))
    }, trimmed ? searchDebounceMs : 0)
    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [searchQuery])

  return { restaurants, source, loading }
}
