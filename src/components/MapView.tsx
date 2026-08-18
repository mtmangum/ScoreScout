import { useEffect, useRef, useState } from 'react'
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

type Basemap = 'street' | 'satellite'

const basemaps: Record<Basemap, { url: string; attribution: string }> = {
  street: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  },
}

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
  const [basemap, setBasemap] = useState<Basemap>('street')
  return (
    <>
      <MapContainer center={defaultCenter} zoom={12} className={`map ${basemap}`} zoomControl={false}>
        <TileLayer key={basemap} attribution={basemaps[basemap].attribution} url={basemaps[basemap].url} />
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
      <button
        type="button"
        className="basemap-toggle"
        onClick={() => setBasemap((current) => (current === 'street' ? 'satellite' : 'street'))}
      >
        {basemap === 'street' ? 'Satellite' : 'Map'}
      </button>
    </>
  )
}
