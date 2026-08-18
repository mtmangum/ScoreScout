import { describe, expect, it } from 'vitest'
import { classifyFacility } from './classifyFacility'

describe('classifyFacility', () => {
  it.each([
    'Akins High School',
    'Allison Elementary',
    'Ashford Montessori',
    'Del Valle ISD Culinary',
    'ABCDee Preschool and Daycare, LLC',
  ])('classifies %s as a school', (name) => {
    expect(classifyFacility(name)).toMatchObject({ category: 'school', confidence: 0.98 })
  })

  it.each([
    'Austin Oaks Hospital',
    'Seton Medical Center-Cafeteria',
    'Legacy Oaks Assisted Living',
    'Brodie Ranch Nursing and Rehabilitation Center',
    'Pecan Ridge Memory Care',
  ])('classifies %s as healthcare', (name) => {
    expect(classifyFacility(name)).toMatchObject({ category: 'healthcare', confidence: 0.98 })
  })

  it.each([
    'Her Hospitality LLC',
    'Hunter Gatherer Hospitality',
    'School House Pub',
    "Titaya's Thai Cuisine",
  ])('keeps uncertain or consumer-facing facility %s visible', (name) => {
    expect(classifyFacility(name).category).toBe('other')
  })
})
