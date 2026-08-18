import { describe, expect, it } from 'vitest'
import { calculateProfile } from '../../src/features/restaurants/score'
import { groupCanonicalInspectionScores } from './canonicalRestaurants'

describe('groupCanonicalInspectionScores', () => {
  it('combines duplicate histories under the canonical facility newest-first', () => {
    const grouped = groupCanonicalInspectionScores([
      { facilityId: 'current', inspectionDate: '2026-05-12', score: 88 },
      { facilityId: 'former', inspectionDate: '2024-06-25', score: 87 },
      { facilityId: 'former', inspectionDate: '2025-02-04', score: 95 },
      { facilityId: 'former', inspectionDate: '2024-01-09', score: 85 },
    ], [{ duplicateFacilityId: 'former', canonicalFacilityId: 'current' }])

    expect(grouped.get('current')).toEqual([88, 95, 87, 85])
    expect(grouped.has('former')).toBe(false)
    expect(calculateProfile(grouped.get('current')!)).toMatchObject({ score: 90, confidence: 'Good' })
  })

  it('keeps a duplicate independent until its canonical facility is available', () => {
    const grouped = groupCanonicalInspectionScores([
      { facilityId: 'former', inspectionDate: '2025-02-04', score: 95 },
    ], [{ duplicateFacilityId: 'former', canonicalFacilityId: 'current' }])

    expect(grouped.get('former')).toEqual([95])
  })
})
