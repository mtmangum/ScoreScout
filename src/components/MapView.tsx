import { memo, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { divIcon, point, type LatLng, type LatLngBounds, type Point } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import Supercluster from 'supercluster'
import type { RestaurantSummary } from '../features/restaurants/types'
import { scoreTone } from '../features/restaurants/scoreTone'
import { isValidBounds, type ViewportBounds } from '../features/restaurants/viewportBounds'

interface MapViewProps {
  restaurants: RestaurantSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onBoundsChange?: (bounds: ViewportBounds) => void
}

interface RestaurantPointProps {
  restaurantId: string
  score: number
}

interface ClusterAggregateProps {
  minScore: number
}

type RestaurantCluster = Supercluster<RestaurantPointProps, ClusterAggregateProps>

const defaultCenter: [number, number] = [30.2747, -97.7404]
const defaultZoom = 12.5
const clusterRadius = 15
const clusterMaxZoom = 16

const streetTiles = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
}

function scorePin(score: number, selected: boolean) {
  const size = selected ? 42 : 34
  return divIcon({
    className: 'score-pin-wrapper',
    html: `<div class="map-score-pin ${scoreTone(score)} ${selected ? 'selected' : ''}"><span>${score}</span></div>`,
    iconSize: [size, size + 8],
    iconAnchor: [size / 2, size + 5],
  })
}

function clusterPin(count: number, worstScore: number) {
  // No count label: a number on a colored circle reads as a score, not a count.
  const size = count >= 100 ? 45 : count >= 25 ? 39 : 33
  return divIcon({
    className: 'cluster-pin-wrapper',
    html: `<div class="map-cluster-pin ${scoreTone(worstScore)}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function toViewportBounds(bounds: LatLngBounds): ViewportBounds {
  return { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() }
}

// A container that's mid-layout (not yet its final size) or hidden entirely
// (display:none, e.g. the mobile map/list tab switch) reports a collapsed or
// zero-area bounds. Silently drop those instead of forwarding them, so a
// transient bad reading can never overwrite the last known-good viewport.
function reportBoundsIfValid(bounds: LatLngBounds, onBoundsChange?: (bounds: ViewportBounds) => void) {
  const converted = toViewportBounds(bounds)
  if (isValidBounds(converted)) onBoundsChange?.(converted)
}

function useRestaurantClusterIndex(restaurants: RestaurantSummary[]) {
  return useMemo(() => {
    const index: RestaurantCluster = new Supercluster({
      radius: clusterRadius,
      maxZoom: clusterMaxZoom,
      map: (props) => ({ minScore: props.score }),
      reduce: (accumulated, props) => { accumulated.minScore = Math.min(accumulated.minScore, props.minScore) },
    })
    index.load(restaurants.map((restaurant) => ({
      type: 'Feature',
      properties: { restaurantId: restaurant.id, score: restaurant.profileScore },
      geometry: { type: 'Point', coordinates: [restaurant.longitude, restaurant.latitude] },
    })))
    return index
  }, [restaurants])
}

// A cluster feature is rendered at its members' aggregate centroid, not at any single
// member's coordinates, so we can't query by a tiny bbox around the raw point. Instead,
// build the query bbox in the same screen-pixel space Supercluster uses for its radius.
// A single expansion step can land on a sub-cluster that still contains the restaurant,
// so instead of hopping level by level, jump straight past clusterMaxZoom, above which
// Supercluster never groups points, guaranteeing the restaurant renders individually.
function findExpansionZoom(map: ReturnType<typeof useMap>, index: RestaurantCluster, restaurant: RestaurantSummary, atZoom: number) {
  const zoom = Math.round(atZoom)
  const centerPoint = map.project([restaurant.latitude, restaurant.longitude], zoom)
  const northWest = map.unproject(centerPoint.subtract([clusterRadius, clusterRadius]), zoom)
  const southEast = map.unproject(centerPoint.add([clusterRadius, clusterRadius]), zoom)
  const bbox: [number, number, number, number] = [northWest.lng, southEast.lat, southEast.lng, northWest.lat]
  const features = index.getClusters(bbox, zoom)
  const isIndividual = features.some((feature) => !('cluster' in feature.properties) && feature.properties.restaurantId === restaurant.id)
  return isIndividual ? null : clusterMaxZoom + 1
}

function SelectionPan({ restaurant, index }: { restaurant?: RestaurantSummary; index: RestaurantCluster }) {
  const map = useMap()

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 800px)').matches
    if (isMobile || !restaurant) return
    const expansionZoom = findExpansionZoom(map, index, restaurant, map.getZoom())
    const targetZoom = expansionZoom ?? map.getZoom()
    const markerPoint = map.project([restaurant.latitude, restaurant.longitude], targetZoom)
    const centerWithPanelOffset = markerPoint.add([205, 0])
    const target = map.unproject(centerWithPanelOffset, targetZoom)
    // flyTo eases through the pan+zoom as one smooth motion; a plain setView snaps
    // large zoom jumps (e.g. revealing a restaurant buried in a cluster) too abruptly.
    const zoomDelta = Math.abs(targetZoom - map.getZoom())
    if (zoomDelta > 0.5) {
      map.flyTo(target, targetZoom, { duration: Math.min(1.6, 0.6 + zoomDelta * 0.1) })
    } else {
      map.panTo(target, { animate: true, duration: 0.45 })
    }
    // Deliberately does nothing on deselect: recentering the map when closing the
    // detail panel was disorienting, especially when zoomed in.
  }, [map, restaurant, index])

  return null
}

// Leaflet caches its container's pixel size at creation time and has no built-in
// way to notice later layout changes (sidebar reflow, panel open/close, fonts
// loading async, mobile browser chrome settling). Without this, the map can keep
// requesting tiles for a stale viewport size, showing up as tiles that only
// partially load. It also re-reports bounds once the size is corrected: if the
// container was too small at mount, the very first bounds handed to the parent
// (see ClusterMarkers) would be wrong, and nothing else would ever fix it.
function MapResize({ onBoundsChange }: { onBoundsChange?: (bounds: ViewportBounds) => void }) {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
      reportBoundsIfValid(map.getBounds(), onBoundsChange)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [map, onBoundsChange])
  return null
}

function LocateButton() {
  const map = useMap()
  const [status, setStatus] = useState<'idle' | 'locating' | 'denied'>('idle')

  const handleClick = () => {
    if (!navigator.geolocation) {
      setStatus('denied')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        map.flyTo([position.coords.latitude, position.coords.longitude], 16, { duration: 1 })
        setStatus('idle')
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <button
      type="button"
      className={`map-icon-button locate-button ${status}`}
      onClick={handleClick}
      disabled={status === 'locating'}
      aria-label={status === 'denied' ? 'Location unavailable' : 'Go to my location'}
      title={status === 'denied' ? 'Location unavailable' : 'Go to my location'}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="6" />
        <circle className="locate-button-dot" cx="12" cy="12" r="2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    </button>
  )
}

// Comparing against "does the current view contain every restaurant in the
// current data set" doesn't work: Austin's full dataset spans well beyond the
// default view's frame, so that comparison would fail (and the button would
// show) as soon as live data loads, regardless of whether the user has
// actually panned or zoomed. Comparing center/zoom to the *realized* initial
// view is what "hasn't moved from the default view" actually means — Leaflet's
// default zoomSnap rounds the fractional defaultZoom (12.5) to a whole number
// internally, so map.getZoom() never equals the literal defaultZoom constant.
function isSameView(a: { lat: number; lng: number }, aZoom: number, b: { lat: number; lng: number }, bZoom: number) {
  return Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lng - b.lng) < 1e-4 && Math.abs(aZoom - bZoom) < 1e-6
}

function ResetViewButton() {
  const map = useMap()
  const [initialView] = useState(() => ({ center: map.getCenter(), zoom: map.getZoom() }))
  const [visible, setVisible] = useState(false)

  useMapEvents({
    moveend: () => setVisible(!isSameView(map.getCenter(), map.getZoom(), initialView.center, initialView.zoom)),
  })

  if (!visible) return null

  return (
    <button
      type="button"
      className="map-icon-button reset-view-button"
      // Flies back to the *captured* initial view, not the raw defaultCenter/
      // defaultZoom constants: Leaflet's zoomSnap rounds a fractional initial
      // zoom prop (12.5) to a whole level (13) at mount, but flyTo honors a
      // fractional target exactly — so flying to the literal constant would
      // never match the mounted baseline this button compares against.
      onClick={() => map.flyTo(initialView.center, initialView.zoom, { duration: 1 })}
      aria-label="Reset map view"
      title="Reset map view"
    >
      Reset
    </button>
  )
}

// Many restaurants in the data share a single street address — food courts, malls,
// stadiums, airport concourses — so their pins sit at (near-)identical coordinates.
// No zoom level pulls those apart: pixel distance between two points grows with zoom,
// but two points metres (or zero metres) apart never clear the pin's own width even at
// the map's practical maximum zoom. Once Supercluster stops grouping them into a single
// cluster pin, fan the individual leaves out into a small circle/spiral around their
// shared spot — the same "spiderfy" technique marker-cluster libraries use — so every
// pin stays its own clickable target regardless of how many restaurants are stacked there.
const overlapPixelThreshold = 24
const spiralLengthStart = 11
const spiralLengthFactor = 5
const spiralFootSeparation = 28
const circleSpiralSwitchover = 8

function spiderfyOffsets(count: number): Array<{ x: number; y: number }> {
  if (count <= circleSpiralSwitchover) {
    const radius = Math.max(overlapPixelThreshold, (spiralFootSeparation * count) / (2 * Math.PI))
    return Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
    })
  }
  let angle = 0
  let radius = spiralLengthStart
  return Array.from({ length: count }, () => {
    angle += spiralFootSeparation / radius
    radius += (spiralLengthFactor * Math.PI * 2) / angle
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
  })
}

// Single-linkage grouping in current-zoom pixel space: a leaf joins a group as soon as
// it's within overlapPixelThreshold of any existing member, so tight stacks of 3+
// coincident points merge into one group instead of just pairing up neighbors.
function groupOverlappingLeaves<T extends { point: Point }>(leaves: T[]): T[][] {
  const groups: T[][] = []
  const assigned = new Set<T>()
  leaves.forEach((leaf) => {
    if (assigned.has(leaf)) return
    const group = [leaf]
    assigned.add(leaf)
    leaves.forEach((other) => {
      if (assigned.has(other)) return
      if (group.some((member) => member.point.distanceTo(other.point) < overlapPixelThreshold)) {
        group.push(other)
        assigned.add(other)
      }
    })
    groups.push(group)
  })
  return groups
}

function useOverlapOffsets(
  leaves: Array<{ restaurantId: string; latitude: number; longitude: number }>,
  map: ReturnType<typeof useMap>,
  zoom: number,
) {
  return useMemo(() => {
    const withPoints = leaves.map((leaf) => ({ ...leaf, point: map.project([leaf.latitude, leaf.longitude], zoom) }))
    const offsets = new Map<string, LatLng>()
    groupOverlappingLeaves(withPoints).forEach((group) => {
      if (group.length < 2) return
      const center = point(
        group.reduce((sum, member) => sum + member.point.x, 0) / group.length,
        group.reduce((sum, member) => sum + member.point.y, 0) / group.length,
      )
      spiderfyOffsets(group.length).forEach((offset, i) => {
        offsets.set(group[i].restaurantId, map.unproject(center.add([offset.x, offset.y]), zoom))
      })
    })
    return offsets
  }, [leaves, map, zoom])
}

function ClusterMarkers({ index, restaurantsById, selectedId, onSelect, onBoundsChange }: {
  index: RestaurantCluster
  restaurantsById: Map<string, RestaurantSummary>
  selectedId: string | null
  onSelect: (id: string) => void
  onBoundsChange?: (bounds: ViewportBounds) => void
}) {
  const map = useMap()
  const [viewport, setViewport] = useState(() => ({ bounds: map.getBounds(), zoom: map.getZoom() }))

  useMapEvents({ moveend: () => setViewport({ bounds: map.getBounds(), zoom: map.getZoom() }) })

  // useLayoutEffect (not useEffect) so the initial viewport reaches the parent
  // before first paint, keeping the list scoped to the map from first render.
  useLayoutEffect(() => {
    reportBoundsIfValid(viewport.bounds, onBoundsChange)
  }, [viewport.bounds, onBoundsChange])

  const clusters = useMemo(() => {
    const bounds = viewport.bounds
    const bbox: [number, number, number, number] = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
    return index.getClusters(bbox, Math.round(viewport.zoom))
  }, [index, viewport])

  const restaurantLeaves = useMemo(() => clusters.flatMap((feature) => {
    if ('cluster' in feature.properties) return []
    const restaurant = restaurantsById.get(feature.properties.restaurantId)
    return restaurant ? [{ restaurantId: restaurant.id, latitude: restaurant.latitude, longitude: restaurant.longitude }] : []
  }), [clusters, restaurantsById])
  const overlapOffsets = useOverlapOffsets(restaurantLeaves, map, Math.round(viewport.zoom))

  return (
    <>
      {clusters.map((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates
        if ('cluster' in feature.properties) {
          const { cluster_id: clusterId, point_count: pointCount, minScore } = feature.properties
          return (
            <Marker
              key={`cluster-${clusterId}`}
              position={[latitude, longitude]}
              icon={clusterPin(pointCount, minScore)}
              eventHandlers={{
                click: () => {
                  const expansionZoom = Math.min(index.getClusterExpansionZoom(clusterId), clusterMaxZoom + 2)
                  map.setView([latitude, longitude], expansionZoom, { animate: true })
                },
              }}
            />
          )
        }
        const restaurant = restaurantsById.get(feature.properties.restaurantId)
        if (!restaurant) return null
        const selected = restaurant.id === selectedId
        return (
          <Marker
            key={restaurant.id}
            position={overlapOffsets.get(restaurant.id) ?? [restaurant.latitude, restaurant.longitude]}
            icon={scorePin(restaurant.profileScore, selected)}
            zIndexOffset={selected ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(restaurant.id) }}
          />
        )
      })}
    </>
  )
}

// Memoized: rebuilding the Supercluster index and re-rendering markers for
// thousands of restaurants is expensive, so it should only happen when this
// component's own props actually change — not on every parent re-render
// caused by unrelated state, like a keystroke in the search box.
export const MapView = memo(function MapView({ restaurants, selectedId, onSelect, onBoundsChange }: MapViewProps) {
  const selectedRestaurant = restaurants.find(({ id }) => id === selectedId)
  const clusterIndex = useRestaurantClusterIndex(restaurants)
  const restaurantsById = useMemo(() => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])), [restaurants])
  return (
    <MapContainer center={defaultCenter} zoom={defaultZoom} className="map" zoomControl={false}>
      <TileLayer attribution={streetTiles.attribution} url={streetTiles.url} />
      <MapResize onBoundsChange={onBoundsChange} />
      {/* Must mount before SelectionPan: a large programmatic zoom fires Leaflet's
          moveend synchronously, so ClusterMarkers' listener has to already be
          subscribed (sibling effects run in JSX order) or it misses the event
          and never re-clusters for the new viewport. */}
      <ClusterMarkers index={clusterIndex} restaurantsById={restaurantsById} selectedId={selectedId} onSelect={onSelect} onBoundsChange={onBoundsChange} />
      <SelectionPan restaurant={selectedRestaurant} index={clusterIndex} />
      <div className="map-controls">
        <ResetViewButton />
        <LocateButton />
      </div>
    </MapContainer>
  )
})
