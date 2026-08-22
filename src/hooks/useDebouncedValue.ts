import { useEffect, useState } from 'react'

// Debounces the value itself, not the input that produces it — a controlled
// text input stays instantly responsive to every keystroke, while whatever
// consumes the debounced value (a fetch, an expensive recompute) only sees
// updates once the value has settled.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    // Always via setTimeout, even at delayMs=0 — one macrotask tick is
    // imperceptible, and it keeps every update off the effect's synchronous body.
    const timeoutId = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timeoutId)
  }, [value, delayMs])

  return debounced
}
