import { describe, expect, it } from 'vitest'
import { isValidBounds, isWithinBounds, type ViewportBounds } from './viewportBounds'

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

describe('isValidBounds', () => {
  it('is true for a normal rectangle', () => {
    expect(isValidBounds(bounds)).toBe(true)
  })

  it('is false for a collapsed (zero-area) rectangle, as a mismeasured map container would report', () => {
    expect(isValidBounds({ north: 30.25, south: 30.25, east: -97.75, west: -97.75 })).toBe(false)
  })

  it('is false when north/south or east/west are inverted', () => {
    expect(isValidBounds({ north: 30.2, south: 30.3, east: -97.7, west: -97.8 })).toBe(false)
  })

  it('is false for non-finite values', () => {
    expect(isValidBounds({ north: NaN, south: 30.2, east: -97.7, west: -97.8 })).toBe(false)
  })
})
