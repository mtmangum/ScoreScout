import { useEffect, useState } from 'react'
import { fetchRestaurants } from '../api/restaurants'
import { restaurants as fixtureRestaurants } from '../data/restaurants'
import type { Restaurant } from '../features/restaurants/types'

export function useRestaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>(fixtureRestaurants)
  const [source, setSource] = useState<'fixture' | 'live'>('fixture')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    fetchRestaurants(controller.signal)
      .then((liveRestaurants) => {
        if (liveRestaurants.length) {
          setRestaurants(liveRestaurants)
          setSource('live')
        }
      })
      .catch(() => {
        setRestaurants(fixtureRestaurants)
        setSource('fixture')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  return { restaurants, source, loading }
}
