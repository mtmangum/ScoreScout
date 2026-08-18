import { supabaseRequest } from './_shared/supabase.mts'

interface ExplorerRow {
  id: string
  facility_id: string
  city_code: string
  route_id: string
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

export default async (request: Request) => {
  try {
    const requestUrl = new URL(request.url)
    const query = new URLSearchParams({ select: '*', latitude: 'not.is.null', longitude: 'not.is.null', limit: '1000' })
    const search = requestUrl.searchParams.get('q')?.trim()
    if (search) query.set('or', `(name.ilike.*${search.replace(/[,%()]/g, '')}*,address.ilike.*${search.replace(/[,%()]/g, '')}*)`)
    const response = await supabaseRequest(`restaurant_explorer?${query}`)
    const rows = await response.json() as ExplorerRow[]
    const restaurants = rows.map((row) => ({
      id: row.id,
      facilityId: row.facility_id,
      cityCode: row.city_code,
      routeId: row.route_id,
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
    }))
    return Response.json({ restaurants, source: 'live' }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load restaurants' }, { status: 503 })
  }
}

export const config = { path: '/api/restaurants' }
