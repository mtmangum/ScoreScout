import { describe, expect, it } from 'vitest'
import { scoreGooglePlaceMatch, type GooglePlace } from './googlePlaces'

const place: GooglePlace = {
  id: 'abc', displayName: { text: 'Juniper Table' }, formattedAddress: '2400 E Cesar Chavez St, Austin, TX',
  location: { latitude: 30.2547, longitude: -97.7167 }, rating: 4.6, userRatingCount: 847,
  googleMapsUri: 'https://maps.google.com/',
}

describe('scoreGooglePlaceMatch', () => {
  it('scores an exact name, address, and location perfectly', () => {
    expect(scoreGooglePlaceMatch({ name: 'Juniper Table', address: '2400 E Cesar Chavez St, Austin, TX', latitude: 30.2547, longitude: -97.7167 }, place)).toBe(1)
  })

  it('flags a distant business with a different address as weak', () => {
    expect(scoreGooglePlaceMatch({ name: 'Juniper Table', address: '1 Congress Ave', latitude: 31, longitude: -98 }, place)).toBeLessThan(0.7)
  })
})
