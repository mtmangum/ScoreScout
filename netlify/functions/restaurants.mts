import { supabaseRequest } from './_shared/supabase.mts'

interface ExplorerRow {
  id: string
  facility_id: string
  city_code: string
  route_id: string
  route_aliases?: string[]
  facility_aliases?: string[]
  facility_category: 'school' | 'healthcare' | 'other'
  name: string
  address: string
  latitude: number
  longitude: number
  profile_score: number
  confidence: 'Limited' | 'Moderate' | 'Good' | 'High'
  weighted_history_score: number
  consistency_adjustment: number
  trend_adjustment: number
  inspections: Array<{ id: string; date: string; score: number; processDescription: string }>
  community_source?: 'Google Places'
  source_business_id?: string
  community_rating?: number
  community_review_count?: number
  community_source_url?: string
  community_matched_at?: string
  community_refreshed_at?: string
  community_match_confidence?: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function toDetail(row: ExplorerRow) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    cityCode: row.city_code,
    routeId: row.route_id,
    routeAliases: row.route_aliases ?? [],
    facilityAliases: row.facility_aliases ?? [],
    facilityCategory: row.facility_category,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    profile: {
      score: Number(row.profile_score), confidence: row.confidence,
      weightedHistoryScore: Number(row.weighted_history_score),
      consistencyAdjustment: Number(row.consistency_adjustment), trendAdjustment: Number(row.trend_adjustment),
    },
    inspections: row.inspections.map((inspection) => ({ ...inspection, score: Number(inspection.score) })),
    communityRating: row.community_source ? {
      source: row.community_source, sourceBusinessId: row.source_business_id,
      rating: Number(row.community_rating), reviewCount: Number(row.community_review_count),
      sourceUrl: row.community_source_url, matchedAt: row.community_matched_at,
      refreshedAt: row.community_refreshed_at, matchConfidence: Number(row.community_match_confidence),
    } : undefined,
  }
}

function toSummary(row: ExplorerRow) {
  return {
    id: row.id,
    facilityId: row.facility_id,
    cityCode: row.city_code,
    routeId: row.route_id,
    routeAliases: row.route_aliases ?? [],
    facilityAliases: row.facility_aliases ?? [],
    facilityCategory: row.facility_category,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    profileScore: Number(row.profile_score),
    latestInspection: { score: Number(row.inspections[0].score), date: row.inspections[0].date },
  }
}

export default async (request: Request) => {
  try {
    const requestUrl = new URL(request.url)
    const detailId = requestUrl.searchParams.get('id')
    const requestedIds = (requestUrl.searchParams.get('ids') ?? '')
      .split(',')
      .filter((id) => uuidPattern.test(id))
      .slice(0, 50)

    // A single restaurant's full record (inspection history, profile breakdown,
    // community rating) — fetched on demand once a specific restaurant is
    // selected, rather than carried by every row in the browse/search list.
    if (detailId && uuidPattern.test(detailId)) {
      const query = new URLSearchParams({ select: '*', id: `eq.${detailId}`, limit: '1' })
      const response = await supabaseRequest(`restaurant_explorer_classified?${query}`)
      const rows = await response.json() as ExplorerRow[]
      return Response.json({ restaurants: rows.map(toDetail), source: 'live' }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
    }

    // Favorite hydration: known IDs, refreshed as lightweight summaries — full
    // detail is fetched separately only when a favorite's card is opened.
    if (requestedIds.length > 0) {
      const query = new URLSearchParams({ select: '*', id: `in.(${requestedIds.join(',')})`, limit: String(requestedIds.length) })
      const response = await supabaseRequest(`restaurant_explorer_classified?${query}`)
      const rows = await response.json() as ExplorerRow[]
      return Response.json({ restaurants: rows.map(toSummary), source: 'live' }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
    }

    // Browse/search list: every matching restaurant as a lightweight summary, so
    // the map has complete coverage and list sorting/filtering see the whole
    // matching population — not an arbitrary page of it. ~6,500 rows today.
    // The Supabase project's PostgREST max-rows setting caps any single
    // response at 1,000 regardless of a larger `limit`, so pull the full
    // result across Range-paginated requests instead, up to a generous
    // safety ceiling against a runaway query.
    const search = requestUrl.searchParams.get('q')?.trim()
    const includeAllFacilities = requestUrl.searchParams.get('includeAll') === 'true'
    const targetRoute = requestUrl.searchParams.get('targetRoute')?.match(/^\d+$/)?.[0]
    const targetFacility = requestUrl.searchParams.get('targetFacility')?.match(/^\d+$/)?.[0]
    // `id` breaks ties on name so multi-page Range requests below see a strict
    // total order — without it, rows sharing a name aren't guaranteed a stable
    // order across separate query executions and can be duplicated or skipped
    // at a page boundary.
    const query = new URLSearchParams({ select: '*', latitude: 'not.is.null', longitude: 'not.is.null', order: 'name.asc,id.asc' })
    const visibilityFilters = ['facility_category.eq.other']
    if (targetRoute) visibilityFilters.push(`route_id.eq.${targetRoute}`, `route_aliases.cs.["${targetRoute}"]`)
    if (targetFacility) visibilityFilters.push(`facility_id.eq.${targetFacility}`, `facility_aliases.cs.["${targetFacility}"]`)
    const searchFilters: string[] = []
    if (search) {
      const escaped = search.replace(/[,%()]/g, '')
      searchFilters.push(`name.ilike.*${escaped}*`, `address.ilike.*${escaped}*`, `search_text.ilike.*${escaped}*`)
    }
    if (!includeAllFacilities && searchFilters.length) query.set('and', `(or(${visibilityFilters}),or(${searchFilters}))`)
    else if (!includeAllFacilities) query.set('or', `(${visibilityFilters})`)
    else if (searchFilters.length) query.set('or', `(${searchFilters})`)

    const pageSize = 1000
    const rowCeiling = 20000
    const rows: ExplorerRow[] = []
    for (let offset = 0; offset < rowCeiling; offset += pageSize) {
      const response = await supabaseRequest(`restaurant_explorer_classified?${query}`, { headers: { Range: `${offset}-${offset + pageSize - 1}` } })
      const page = await response.json() as ExplorerRow[]
      rows.push(...page)
      if (page.length < pageSize) break
    }
    return Response.json({ restaurants: rows.map(toSummary), source: 'live' }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load restaurants' }, { status: 503 })
  }
}

export const config = { path: '/api/restaurants' }
