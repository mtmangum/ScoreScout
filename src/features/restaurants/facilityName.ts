const RECORD_PREFIX = /^[A-Z]{2,3} - /

/**
 * Austin's permit feed prefixes some facility names with a short record-type
 * code (e.g. "OOB - Shoal Creek Saloon", "PF - Starbucks Coffee #14446").
 * These are permit-record artifacts, not part of the business name — "OOB"
 * in particular reads as "out of business" to users even when the venue is
 * open, so strip it for display. Matching/search logic should keep using the
 * raw name.
 */
export function formatFacilityName(name: string) {
  return name.replace(RECORD_PREFIX, '')
}
