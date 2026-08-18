export type Confidence = 'Limited' | 'Moderate' | 'Good' | 'High'
export type FacilityCategory = 'school' | 'healthcare' | 'other'

export interface Inspection {
  id: string
  date: string
  score: number
  processDescription: string
}

export interface ProfileBreakdown {
  score: number
  confidence: Confidence
  weightedHistoryScore: number
  consistencyAdjustment: number
  trendAdjustment: number
}

export interface CommunityRating {
  source: 'Google Places'
  sourceBusinessId: string
  rating: number
  reviewCount: number
  sourceUrl: string
  matchedAt: string
  refreshedAt: string
  matchConfidence: number
}

export interface Restaurant {
  id: string
  cityCode: string
  routeId: string
  facilityId: string
  routeAliases?: string[]
  facilityAliases?: string[]
  facilityCategory?: FacilityCategory
  name: string
  address: string
  latitude: number
  longitude: number
  inspections: Inspection[]
  profile: ProfileBreakdown
  communityRating?: CommunityRating
}
