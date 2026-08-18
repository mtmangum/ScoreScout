import { describe, expect, it } from 'vitest'
import { calculateProfile, confidenceForCount } from './score'

describe('calculateProfile', () => {
  it('returns the only available official score', () => {
    expect(calculateProfile([96])).toMatchObject({ score: 96, confidence: 'Limited' })
  })

  it('weights recent inspections more heavily and rewards an improving trend', () => {
    const result = calculateProfile([96, 92, 88, 84])
    expect(result.score).toBe(94)
    expect(result.trendAdjustment).toBe(2.6)
  })

  it('uses only four scores while confidence reflects all available history', () => {
    expect(calculateProfile([90, 90, 90, 90, 20])).toMatchObject({ score: 90, confidence: 'High' })
  })

  it('rejects missing and out-of-range scores', () => {
    expect(() => calculateProfile([])).toThrow()
    expect(() => calculateProfile([101])).toThrow()
  })
})

describe('confidenceForCount', () => {
  it.each([[1, 'Limited'], [2, 'Moderate'], [4, 'Good'], [5, 'High']] as const)(
    'maps %i inspections to %s confidence',
    (count, confidence) => expect(confidenceForCount(count)).toBe(confidence),
  )
})
