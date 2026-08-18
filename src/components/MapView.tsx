import { useEffect, useRef } from 'react'
import { divIcon } from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import type { Restaurant } from '../features/restaurants/types'
import { scoreTone } from '../features/restaurants/scoreTone'

interface MapViewProps {
  restaurants: Restaurant[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const defaultCenter: [number, number] = [30.2747, -97.7404]

function scorePin(score: number, selected: boolean) {
  const size = selected ? 56 : 48
  return divIcon({
    className: 'score-pin-wrapper',
    html: `<div class="map-score-pin ${scoreTone(score)} ${selected ? 'selected' : ''}"><span>${score}</span></div>`,
    iconSize: [size, size + 8],
    iconAnchor: [size / 2, size + 5],
  })
}

function SelectionPan({ restaurant, selectedId }: { restaurant?: Restaurant; selectedId: string | null }) {
  const map = useMap()
  const previousSelectedId = useRef<string | null>(null)

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 800px)').matches
    if (!isMobile && restaurant) {
      const markerPoint = map.project([restaurant.latitude, restaurant.longitude], map.getZoom())
      const centerWithPanelOffset = markerPoint.add([205, 0])
      map.panTo(map.unproject(centerWithPanelOffset, map.getZoom()), { animate: true, duration: 0.45 })
    } else if (!isMobile && selectedId === null && previousSelectedId.current !== null) {
      map.panTo(defaultCenter, { animate: true, duration: 0.45 })
    }
    previousSelectedId.current = selectedId
  }, [map, restaurant, selectedId])

  return null
}

export function MapView({ restaurants, selectedId, onSelect }: MapViewProps) {
  const selectedRestaurant = restaurants.find(({ id }) => id === selectedId)
  return (
    <MapContainer center={defaultCenter} zoom={12} className="map" zoomControl={false}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <SelectionPan restaurant={selectedRestaurant} selectedId={selectedId} />
      {restaurants.map((restaurant) => {
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
    </MapContainer>
  )
}
