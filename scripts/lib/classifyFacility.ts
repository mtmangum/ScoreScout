export type FacilityCategory = 'school' | 'healthcare' | 'other'

export interface FacilityClassification {
  category: FacilityCategory
  confidence: number
  method: 'rules-v1'
}

const schoolPattern = /(elementary|middle\s+school|high\s+school|preschool|pre-school|montessori|child\s?care|day\s?care|head\s+start|independent\s+school\s+district|\bisd\b)/i
const healthcarePattern = /\b(hospital|medical\s+center|nursing|assisted\s+living|senior\s+living|rehabilitation|hospice|memory\s+care|healthcare\s+center|health\s+care\s+center)\b/i

/**
 * Conservative facility classification. Only high-confidence institutional
 * names are removed from the default explorer; everything uncertain remains
 * visible as `other` until a stronger rule or manual review exists.
 */
export function classifyFacility(name: string): FacilityClassification {
  if (schoolPattern.test(name)) return { category: 'school', confidence: 0.98, method: 'rules-v1' }
  if (healthcarePattern.test(name)) return { category: 'healthcare', confidence: 0.98, method: 'rules-v1' }
  return { category: 'other', confidence: 0.5, method: 'rules-v1' }
}
