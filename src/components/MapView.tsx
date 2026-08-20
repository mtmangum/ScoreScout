import { memo, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import Supercluster from 'supercluster'
import type { RestaurantSummary } from '../features/restaurants/types'
import { scoreTone } from '../features/restaurants/scoreTone'
import type { ViewportBounds } from '../features/restaurants/viewportBounds'

interface MapViewProps {
  restaurants: RestaurantSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  onBoundsChange?: (bounds: ViewportBounds) => void
  showResetView?: boolean
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
// loading async). Without this, the map can keep requesting tiles for a stale
// viewport size, showing up as tiles that only partially load.
function MapResize() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])
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

function ResetViewButton() {
  const map = useMap()

  return (
    <button
      type="button"
      className="map-icon-button reset-view-button"
      onClick={() => map.flyTo(defaultCenter, defaultZoom, { duration: 1 })}
      aria-label="Reset map view"
      title="Reset map view"
    >
      Reset
    </button>
  )
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
    onBoundsChange?.({
      north: viewport.bounds.getNorth(),
      south: viewport.bounds.getSouth(),
      east: viewport.bounds.getEast(),
      west: viewport.bounds.getWest(),
    })
  }, [viewport.bounds, onBoundsChange])

  const clusters = useMemo(() => {
    const bounds = viewport.bounds
    const bbox: [number, number, number, number] = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
    return index.getClusters(bbox, Math.round(viewport.zoom))
  }, [index, viewport])

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
            position={[restaurant.latitude, restaurant.longitude]}
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
export const MapView = memo(function MapView({ restaurants, selectedId, onSelect, onBoundsChange, showResetView }: MapViewProps) {
  const selectedRestaurant = restaurants.find(({ id }) => id === selectedId)
  const clusterIndex = useRestaurantClusterIndex(restaurants)
  const restaurantsById = useMemo(() => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])), [restaurants])
  return (
    <MapContainer center={defaultCenter} zoom={defaultZoom} className="map" zoomControl={false}>
      <TileLayer attribution={streetTiles.attribution} url={streetTiles.url} />
      <MapResize />
      {/* Must mount before SelectionPan: a large programmatic zoom fires Leaflet's
          moveend synchronously, so ClusterMarkers' listener has to already be
          subscribed (sibling effects run in JSX order) or it misses the event
          and never re-clusters for the new viewport. */}
      <ClusterMarkers index={clusterIndex} restaurantsById={restaurantsById} selectedId={selectedId} onSelect={onSelect} onBoundsChange={onBoundsChange} />
      <SelectionPan restaurant={selectedRestaurant} index={clusterIndex} />
      <div className="map-controls">
        {showResetView && <ResetViewButton />}
        <LocateButton />
      </div>
    </MapContainer>
  )
})
