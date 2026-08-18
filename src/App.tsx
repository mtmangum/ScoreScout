import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ExplorePage } from './pages/ExplorePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ExplorePage />} />
        <Route path="/:cityCode/:restaurantKey" element={<ExplorePage />} />
        <Route path="/r/:restaurantKey" element={<ExplorePage />} />
        <Route path="/restaurants/:restaurantSlug/:facilityId" element={<ExplorePage />} />
        <Route path="/restaurants/:facilityId" element={<ExplorePage />} />
        <Route path="*" element={<ExplorePage />} />
      </Routes>
    </BrowserRouter>
  )
}
