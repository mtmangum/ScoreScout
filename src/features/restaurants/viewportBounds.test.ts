import { describe, expect, it } from 'vitest'
import { isWithinBounds, type ViewportBounds } from './viewportBounds'

const bounds: ViewportBounds = { north: 30.3, south: 30.2, east: -97.7, west: -97.8 }

describe('isWithinBounds', () => {
  it('is true for a point inside the rectangle', () => {
    expect(isWithinBounds({ latitude: 30.25, longitude: -97.75 }, bounds)).toBe(true)
  })

  it('is false for a point outside each edge', () => {
    expect(isWithinBounds({ latitude: 30.31, longitude: -97.75 }, bounds)).toBe(false)
    expect(isWithinBounds({ latitude: 30.19, longitude: -97.75 }, bounds)).toBe(false)
    expect(isWithinBounds({ latitude: 30.25, longitude: -97.69 }, bounds)).toBe(false)
    expect(isWithinBounds({ latitude: 30.25, longitude: -97.81 }, bounds)).toBe(false)
  })

  it('is inclusive of points exactly on the boundary', () => {
    expect(isWithinBounds({ latitude: bounds.north, longitude: bounds.east }, bounds)).toBe(true)
    expect(isWithinBounds({ latitude: bounds.south, longitude: bounds.west }, bounds)).toBe(true)
  })
})
