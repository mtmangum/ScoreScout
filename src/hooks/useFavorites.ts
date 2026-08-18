import { useCallback, useEffect, useMemo, useState } from 'react'

const storageKey = 'scorescout-favorite-restaurants'

function loadFavoriteIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function useFavorites() {
  const [ids, setIds] = useState<string[]>(loadFavoriteIds)
  const favoriteIds = useMemo(() => new Set(ids), [ids])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids))
    } catch {
      // Favorites still work for this session when storage is unavailable.
    }
  }, [ids])

  const toggleFavorite = useCallback((id: string) => {
    setIds((current) => current.includes(id) ? current.filter((favoriteId) => favoriteId !== id) : [...current, id])
  }, [])

  return { favoriteIds, toggleFavorite }
}
