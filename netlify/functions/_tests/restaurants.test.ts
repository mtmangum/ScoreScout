import { beforeEach, describe, expect, it, vi } from 'vitest'

// Exercises the pagination/ordering logic against a synthetic dataset shaped
// like production scale (thousands of rows, many sharing the same `name`),
// without a live Supabase connection. This is the regression test for a real
// bug caught only by running against real data: `order=name.asc` alone isn't
// a stable sort key when many rows tie on name, so Range-paginated requests
// could return the same row on two pages. See CHANGELOG.md "Replaced the
// arbitrary 1,000-row browse cap...".
const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }))
vi.mock('../_shared/supabase.mts', () => ({ supabaseRequest }))

interface FakeRow {
  id: string
  facility_id: string
  city_code: string
  route_id: string
  facility_category: 'school' | 'healthcare' | 'other'
  name: string
  address: string
  latitude: number
  longitude: number
  profile_score: number
  confidence: string
  weighted_history_score: number
  consistency_adjustment: number
  trend_adjustment: number
  inspections: Array<{ id: string; date: string; score: number; processDescription: string }>
}

function makeUuid(index: number) {
  const hex = index.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

function makeRow(index: number, nameGroup: number): FakeRow {
  return {
    id: makeUuid(index),
    facility_id: `fac-${index}`,
    city_code: 'AUS',
    route_id: String(index),
    facility_category: 'other',
    name: `Test Restaurant ${nameGroup}`,
    address: `${index} Test St`,
    latitude: 30.27,
    longitude: -97.74,
    profile_score: 80,
    confidence: 'High',
    weighted_history_score: 80,
    consistency_adjustment: 0,
    trend_adjustment: 0,
    inspections: [{ id: `insp-${index}`, date: '2026-01-01', score: 80, processDescription: 'Routine Inspection' }],
  }
}

// Production scale (~6,500 rows), with heavy name collisions (47 rows per
// name — deliberately not a divisor of the 1,000-row page size, so name
// groups straddle page boundaries and a missing tiebreaker actually surfaces
// duplicates/gaps instead of coincidentally aligning with them).
const rowCount = 2500
const namesPerGroup = 47
const allRows: FakeRow[] = Array.from({ length: rowCount }, (_, index) => makeRow(index, Math.floor(index / namesPerGroup)))

// Real Postgres/PostgREST doesn't guarantee a stable order for rows tied on
// the sort key across separate query executions. `order=name.asc` alone has
// thousands of ties here (50 rows per name), so each call reshuffles within
// name groups to model that instability — only a full tiebreaker like
// `name.asc,id.asc` produces the same order on every call.
function sortedForQuery(orderParam: string | null) {
  const hasUniqueTiebreaker = orderParam?.includes('id.asc') ?? false
  const groups = new Map<string, FakeRow[]>()
  for (const row of allRows) {
    const group = groups.get(row.name) ?? []
    group.push(row)
    groups.set(row.name, group)
  }
  const names = [...groups.keys()].sort((a, b) => a.localeCompare(b))
  return names.flatMap((name) => {
    const group = groups.get(name)!
    if (hasUniqueTiebreaker) return [...group].sort((a, b) => a.id.localeCompare(b.id))
    // Fisher-Yates shuffle: a different, non-deterministic order per call.
    const shuffled = [...group]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  })
}

beforeEach(() => {
  supabaseRequest.mockReset()
  // Mimics Supabase's PostgREST max-rows setting: any single request, no
  // matter what `limit` it asks for, is capped at 1,000 rows, and pagination
  // must happen via the `Range` header instead. Also honors the `id=eq.` and
  // `id=in.()` filters the handler sends for its single-record and batch modes.
  supabaseRequest.mockImplementation(async (path: string, init?: RequestInit) => {
    const query = new URLSearchParams(path.split('?')[1] ?? '')
    const idFilter = query.get('id')

    if (idFilter?.startsWith('eq.')) {
      const match = allRows.filter((row) => row.id === idFilter.slice('eq.'.length))
      return { json: async () => match } as Response
    }
    if (idFilter?.startsWith('in.(')) {
      const ids = new Set(idFilter.slice('in.('.length, -1).split(','))
      const match = allRows.filter((row) => ids.has(row.id))
      return { json: async () => match } as Response
    }

    const range = (init?.headers as Record<string, string> | undefined)?.Range
    const [start, end] = range ? range.split('-').map(Number) : [0, 999]
    const pageSize = Math.min(end - start + 1, 1000)
    const page = sortedForQuery(query.get('order')).slice(start, start + pageSize)
    return { json: async () => page } as Response
  })
})

describe('GET /api/restaurants (browse/summary mode)', () => {
  it('returns every matching row exactly once across multiple Range-paginated pages', async () => {
    const { default: handler } = await import('../restaurants.mts')
    const response = await handler(new Request('http://localhost/api/restaurants'))
    const payload = await response.json() as { restaurants: Array<{ id: string }> }

    expect(payload.restaurants).toHaveLength(rowCount)
    const uniqueIds = new Set(payload.restaurants.map((r) => r.id))
    expect(uniqueIds.size).toBe(rowCount)
  })

  it('returns the lightweight summary shape, not full inspection/profile detail', async () => {
    const { default: handler } = await import('../restaurants.mts')
    const response = await handler(new Request('http://localhost/api/restaurants'))
    const payload = await response.json() as { restaurants: Array<Record<string, unknown>> }

    const row = payload.restaurants[0]
    expect(row).toHaveProperty('profileScore')
    expect(row).toHaveProperty('latestInspection')
    expect(row).not.toHaveProperty('inspections')
    expect(row).not.toHaveProperty('profile')
    expect(row).not.toHaveProperty('address')
  })
})

describe('GET /api/restaurants?id=... (detail mode)', () => {
  it('returns the full record including inspections and profile breakdown', async () => {
    const { default: handler } = await import('../restaurants.mts')
    const response = await handler(new Request(`http://localhost/api/restaurants?id=${makeUuid(42)}`))
    const payload = await response.json() as { restaurants: Array<Record<string, unknown>> }

    expect(payload.restaurants).toHaveLength(1)
    expect(payload.restaurants[0]).toHaveProperty('inspections')
    expect(payload.restaurants[0]).toHaveProperty('profile')
    expect(payload.restaurants[0]).toHaveProperty('address')
  })
})

describe('GET /api/restaurants?ids=... (favorites batch mode)', () => {
  it('returns summary shape for exactly the requested ids', async () => {
    const { default: handler } = await import('../restaurants.mts')
    const ids = [makeUuid(10), makeUuid(20)]
    const response = await handler(new Request(`http://localhost/api/restaurants?ids=${ids.join(',')}`))
    const payload = await response.json() as { restaurants: Array<{ id: string }> }

    expect(payload.restaurants.map((r) => r.id).sort()).toEqual([...ids].sort())
    expect(payload.restaurants[0]).toHaveProperty('profileScore')
    expect(payload.restaurants[0]).not.toHaveProperty('inspections')
  })
})
