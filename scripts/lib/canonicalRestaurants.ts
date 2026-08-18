export interface DuplicateRule {
  duplicateFacilityId: string
  canonicalFacilityId: string
}

export interface FacilityInspectionScore {
  facilityId: string
  inspectionDate: string
  score: number
}

/**
 * Groups source inspection scores under reviewed canonical facilities while
 * retaining facility IDs on the source rows themselves. A rule is ignored
 * until its canonical facility is present, so a fresh or partial import never
 * drops a duplicate's profile while the canonical record is unavailable.
 */
export function groupCanonicalInspectionScores(
  inspections: FacilityInspectionScore[],
  rules: DuplicateRule[],
) {
  const availableFacilities = new Set(inspections.map(({ facilityId }) => facilityId))
  const canonicalByDuplicate = new Map(
    rules
      .filter(({ canonicalFacilityId }) => availableFacilities.has(canonicalFacilityId))
      .map(({ duplicateFacilityId, canonicalFacilityId }) => [duplicateFacilityId, canonicalFacilityId]),
  )
  const grouped = new Map<string, FacilityInspectionScore[]>()

  for (const inspection of inspections) {
    const canonicalFacilityId = canonicalByDuplicate.get(inspection.facilityId) ?? inspection.facilityId
    grouped.set(canonicalFacilityId, [...(grouped.get(canonicalFacilityId) ?? []), inspection])
  }

  return new Map([...grouped].map(([facilityId, history]) => [
    facilityId,
    history
      .sort((left, right) => right.inspectionDate.localeCompare(left.inspectionDate))
      .map(({ score }) => score),
  ]))
}
