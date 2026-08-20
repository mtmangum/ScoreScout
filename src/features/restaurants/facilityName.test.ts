import { describe, expect, it } from 'vitest'
import { formatFacilityName } from './facilityName'

describe('formatFacilityName', () => {
  it('strips known permit-record prefixes', () => {
    expect(formatFacilityName('OOB - Shoal Creek Saloon')).toBe('Shoal Creek Saloon')
    expect(formatFacilityName('PF - Starbucks Coffee #14446')).toBe('Starbucks Coffee #14446')
    expect(formatFacilityName('BC - Vivel Crepes & Coffee Express')).toBe('Vivel Crepes & Coffee Express')
  })

  it('leaves names without a prefix unchanged', () => {
    expect(formatFacilityName('Torchys Tacos')).toBe('Torchys Tacos')
  })

  it('does not strip a prefix that only appears mid-string', () => {
    expect(formatFacilityName('El OOB - Taco Stand')).toBe('El OOB - Taco Stand')
  })
})
