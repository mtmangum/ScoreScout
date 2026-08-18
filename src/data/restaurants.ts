import { calculateProfile } from '../features/restaurants/score'
import type { Inspection, Restaurant } from '../features/restaurants/types'

const fixtures: Array<Omit<Restaurant, 'profile' | 'inspections'> & { inspections: Inspection[] }> = [
  {
    id: '1', cityCode: 'AUS', routeId: '01', facilityId: 'AUS-1001', name: 'Juniper Table', address: '2400 E Cesar Chavez St, Austin, TX', latitude: 30.2547, longitude: -97.7167,
    communityRating: { source: 'Google Places', sourceBusinessId: 'fixture-1', rating: 4.6, reviewCount: 847, sourceUrl: 'https://maps.google.com/', matchedAt: '2026-08-17', refreshedAt: '2026-08-17', matchConfidence: 0.98 },
    inspections: [
      { id: 'i1', date: '2026-06-12', score: 96, processDescription: 'Routine Inspection' },
      { id: 'i2', date: '2025-11-03', score: 92, processDescription: 'Routine Inspection' },
      { id: 'i3', date: '2025-03-18', score: 88, processDescription: 'Routine Inspection' },
      { id: 'i4', date: '2024-08-22', score: 84, processDescription: 'Routine Inspection' },
      { id: 'i5', date: '2024-01-10', score: 91, processDescription: 'Routine Inspection' },
    ],
  },
  {
    id: '2', cityCode: 'AUS', routeId: '02', facilityId: 'AUS-1002', name: 'Barton Bakehouse', address: '1700 S Lamar Blvd, Austin, TX', latitude: 30.2522, longitude: -97.7661,
    communityRating: { source: 'Google Places', sourceBusinessId: 'fixture-2', rating: 4.2, reviewCount: 316, sourceUrl: 'https://maps.google.com/', matchedAt: '2026-08-17', refreshedAt: '2026-08-17', matchConfidence: 0.96 },
    inspections: [
      { id: 'i6', date: '2026-05-09', score: 89, processDescription: 'Routine Inspection' },
      { id: 'i7', date: '2025-09-14', score: 93, processDescription: 'Routine Inspection' },
      { id: 'i8', date: '2025-01-20', score: 91, processDescription: 'Routine Inspection' },
    ],
  },
  {
    id: '3', cityCode: 'AUS', routeId: '03', facilityId: 'AUS-1003', name: 'North Loop Noodles', address: '5301 Airport Blvd, Austin, TX', latitude: 30.3208, longitude: -97.7150,
    communityRating: { source: 'Google Places', sourceBusinessId: 'fixture-3', rating: 4.8, reviewCount: 129, sourceUrl: 'https://maps.google.com/', matchedAt: '2026-08-17', refreshedAt: '2026-08-17', matchConfidence: 0.94 },
    inspections: [
      { id: 'i9', date: '2026-04-24', score: 78, processDescription: 'Routine Inspection' },
      { id: 'i10', date: '2025-08-11', score: 72, processDescription: 'Routine Inspection' },
    ],
  },
  {
    id: '4', cityCode: 'AUS', routeId: '04', facilityId: 'AUS-1004', name: 'Violet Crown Tacos', address: '1111 E 6th St, Austin, TX', latitude: 30.2639, longitude: -97.7295,
    communityRating: { source: 'Google Places', sourceBusinessId: 'fixture-4', rating: 3.9, reviewCount: 74, sourceUrl: 'https://maps.google.com/', matchedAt: '2026-08-17', refreshedAt: '2026-08-17', matchConfidence: 0.92 },
    inspections: [
      { id: 'i11', date: '2026-07-02', score: 98, processDescription: 'Routine Inspection' },
    ],
  },
  {
    id: '5', cityCode: 'AUS', routeId: '05', facilityId: 'AUS-1005', name: 'South Congress Kitchen', address: '2100 S Congress Ave, Austin, TX', latitude: 30.2429, longitude: -97.7522,
    inspections: [
      { id: 'i12', date: '2026-03-06', score: 67, processDescription: 'Routine Inspection' },
      { id: 'i13', date: '2025-07-19', score: 75, processDescription: 'Routine Inspection' },
      { id: 'i14', date: '2024-12-01', score: 81, processDescription: 'Routine Inspection' },
      { id: 'i15', date: '2024-04-15', score: 86, processDescription: 'Routine Inspection' },
    ],
  },
]

export const restaurants: Restaurant[] = fixtures.map((restaurant) => ({
  ...restaurant,
  profile: calculateProfile(restaurant.inspections.map((inspection) => inspection.score)),
}))
