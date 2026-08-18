import { useEffect, useMemo, useRef, useState } from 'react'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import Supercluster from 'supercluster'
import type { Restaurant } from '../features/restaurants/types'
import { scoreTone } from '../features/restaurants/scoreTone'

interface MapViewProps {
  restaurants: Restaurant[]
  selectedId: string | null
  onSelect: (id: string) => void
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
const clusterRadius = 60
const clusterMaxZoom = 16

type Basemap = 'street' | 'satellite' | 'hybrid'

const streetTiles = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap contributors',
}

const imageryTiles = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
}

const labelsOverlay = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Labels &copy; Esri',
}

const basemapOptions: Array<{ value: Basemap; label: string }> = [
  { value: 'street', label: 'Map' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'hybrid', label: 'Hybrid' },
]

function scorePin(score: number, selected: boolean) {
  const size = selected ? 56 : 48
  return divIcon({
    className: 'score-pin-wrapper',
    html: `<div class="map-score-pin ${scoreTone(score)} ${selected ? 'selected' : ''}"><span>${score}</span></div>`,
    iconSize: [size, size + 8],
    iconAnchor: [size / 2, size + 5],
  })
}

function clusterPin(count: number, worstScore: number) {
  // No count label: a number on a colored circle reads as a score, not a count.
  const size = count >= 100 ? 60 : count >= 25 ? 52 : 44
  return divIcon({
    className: 'cluster-pin-wrapper',
    html: `<div class="map-cluster-pin ${scoreTone(worstScore)}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function useRestaurantClusterIndex(restaurants: Restaurant[]) {
  return useMemo(() => {
    const index: RestaurantCluster = new Supercluster({
      radius: clusterRadius,
      maxZoom: clusterMaxZoom,
      map: (props) => ({ minScore: props.score }),
      reduce: (accumulated, props) => { accumulated.minScore = Math.min(accumulated.minScore, props.minScore) },
    })
    index.load(restaurants.map((restaurant) => ({
      type: 'Feature',
      properties: { restaurantId: restaurant.id, score: restaurant.profile.score },
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
function findExpansionZoom(map: ReturnType<typeof useMap>, index: RestaurantCluster, restaurant: Restaurant, atZoom: number) {
  const zoom = Math.round(atZoom)
  const centerPoint = map.project([restaurant.latitude, restaurant.longitude], zoom)
  const northWest = map.unproject(centerPoint.subtract([clusterRadius, clusterRadius]), zoom)
  const southEast = map.unproject(centerPoint.add([clusterRadius, clusterRadius]), zoom)
  const bbox: [number, number, number, number] = [northWest.lng, southEast.lat, southEast.lng, northWest.lat]
  const features = index.getClusters(bbox, zoom)
  const isIndividual = features.some((feature) => !('cluster' in feature.properties) && feature.properties.restaurantId === restaurant.id)
  return isIndividual ? null : clusterMaxZoom + 1
}

function SelectionPan({ restaurant, selectedId, index }: { restaurant?: Restaurant; selectedId: string | null; index: RestaurantCluster }) {
  const map = useMap()
  const previousSelectedId = useRef<string | null>(null)

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 800px)').matches
    if (!isMobile && restaurant) {
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
    } else if (!isMobile && selectedId === null && previousSelectedId.current !== null) {
      map.panTo(defaultCenter, { animate: true, duration: 0.45 })
    }
    previousSelectedId.current = selectedId
  }, [map, restaurant, selectedId, index])

  return null
}

function ClusterMarkers({ index, restaurantsById, selectedId, onSelect }: {
  index: RestaurantCluster
  restaurantsById: Map<string, Restaurant>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const map = useMap()
  const [viewport, setViewport] = useState(() => ({ bounds: map.getBounds(), zoom: map.getZoom() }))

  useMapEvents({ moveend: () => setViewport({ bounds: map.getBounds(), zoom: map.getZoom() }) })

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
            icon={scorePin(restaurant.profile.score, selected)}
            zIndexOffset={selected ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(restaurant.id) }}
          />
        )
      })}
    </>
  )
}

export function MapView({ restaurants, selectedId, onSelect }: MapViewProps) {
  const selectedRestaurant = restaurants.find(({ id }) => id === selectedId)
  const [basemap, setBasemap] = useState<Basemap>('street')
  const base = basemap === 'street' ? streetTiles : imageryTiles
  const clusterIndex = useRestaurantClusterIndex(restaurants)
  const restaurantsById = useMemo(() => new Map(restaurants.map((restaurant) => [restaurant.id, restaurant])), [restaurants])
  return (
    <>
      <MapContainer center={defaultCenter} zoom={12} className={`map ${basemap}`} zoomControl={false}>
        <TileLayer key={basemap === 'street' ? 'street' : 'imagery'} attribution={base.attribution} url={base.url} />
        {basemap === 'hybrid' && (
          <TileLayer key="labels" attribution={labelsOverlay.attribution} url={labelsOverlay.url} zIndex={2} />
        )}
        {/* Must mount before SelectionPan: a large programmatic zoom fires Leaflet's
            moveend synchronously, so ClusterMarkers' listener has to already be
            subscribed (sibling effects run in JSX order) or it misses the event
            and never re-clusters for the new viewport. */}
        <ClusterMarkers index={clusterIndex} restaurantsById={restaurantsById} selectedId={selectedId} onSelect={onSelect} />
        <SelectionPan restaurant={selectedRestaurant} selectedId={selectedId} index={clusterIndex} />
      </MapContainer>
      <div className="basemap-toggle" role="group" aria-label="Map style">
        {basemapOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === basemap ? 'active' : undefined}
            onClick={() => setBasemap(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  )
}
