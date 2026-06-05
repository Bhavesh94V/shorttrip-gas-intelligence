import { useState, useEffect, useRef } from 'react'
import { MapPin, AlertTriangle, ChevronRight, Navigation, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchStores, MOCK_STORES } from '../api/priceApi'

// ── Leaflet is loaded from CDN in index.html ─────────────────
// We check for window.L to use the global Leaflet library

export default function MapView() {
  const navigate = useNavigate()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [leafletLoaded, setLeafletLoaded] = useState(false)

  // Load store data
  useEffect(() => {
    fetchStores()
      .then(d => setStores(d.stores || []))
      .catch(() => setStores(MOCK_STORES))
      .finally(() => setLoading(false))
  }, [])

  // Load Leaflet CSS + JS dynamically
  useEffect(() => {
    if (window.L) {
      setLeafletLoaded(true)
      return
    }

    // Add CSS
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    // Add JS
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setLeafletLoaded(true)
    document.head.appendChild(script)

    return () => {
      document.head.removeChild(link)
      document.head.removeChild(script)
    }
  }, [])

  // Initialize map when Leaflet and stores are ready
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || stores.length === 0 || mapInstanceRef.current) return

    const L = window.L
    
    // Center on South Carolina
    const map = L.map(mapRef.current, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView([33.4, -80.3], 8)

    // Dark tile layer matching our dashboard theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com">CARTO</a>',
      maxZoom: 19,
    }).addTo(map)

    // Add markers for each store
    stores.forEach(store => {
      if (!store.lat || !store.lng) return

      const lat = parseFloat(store.lat)
      const lng = parseFloat(store.lng)
      const diff = parseFloat(store.price_diff || 0)
      const status = store.price_status || 'skip'

      // Color by status
      const color = status === 'alert' ? '#EF4444'
                  : status === 'monitor' ? '#F97316'
                  : status === 'ok' ? '#22C55E'
                  : '#6B7280'

      // Create custom icon
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            width: 36px; height: 36px;
            border-radius: 50%;
            background: ${color};
            border: 3px solid rgba(255,255,255,0.9);
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            cursor: pointer;
            font-size: 12px; font-weight: 800; color: white;
            transition: transform 0.2s;
          " onmouseover="this.style.transform='scale(1.3)'" onmouseout="this.style.transform='scale(1)'">
            ${store.id}
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      const marker = L.marker([lat, lng], { icon }).addTo(map)

      // Popup
      const ourPrice = parseFloat(store.our_price || 0).toFixed(3)
      const compPrice = store.best_comp_price ? parseFloat(store.best_comp_price).toFixed(3) : '—'
      const diffStr = diff > 0 ? `+${diff.toFixed(3)}` : diff.toFixed(3)
      const diffColor = diff < -0.05 ? '#EF4444' : diff < 0 ? '#F97316' : '#22C55E'

      marker.bindPopup(`
        <div style="font-family: 'Inter', sans-serif; min-width: 200px; padding: 4px;">
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 6px; color: #111;">${store.name}</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #666; font-size: 12px;">Our Price</span>
            <span style="font-weight: 700; color: #E31E24; font-size: 14px;">$${ourPrice}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #666; font-size: 12px;">${store.best_comp_name || 'Competitor'}</span>
            <span style="font-weight: 700; font-size: 14px;">$${compPrice}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #666; font-size: 12px;">Difference</span>
            <span style="font-weight: 700; color: ${diffColor}; font-size: 14px;">${diffStr}</span>
          </div>
          <a href="/stores/${store.id}" style="
            display: block; text-align: center; padding: 6px 12px;
            background: #E31E24; color: white; border-radius: 8px;
            font-size: 12px; font-weight: 600; text-decoration: none;
          ">View Details →</a>
        </div>
      `, { maxWidth: 260 })

      marker.on('click', () => setSelected(store))
    })

    // Fit bounds to show all stores
    const validStores = stores.filter(s => s.lat && s.lng)
    if (validStores.length > 0) {
      const bounds = L.latLngBounds(validStores.map(s => [parseFloat(s.lat), parseFloat(s.lng)]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [leafletLoaded, stores])

  const statusCounts = {
    alert: stores.filter(s => s.price_status === 'alert').length,
    monitor: stores.filter(s => s.price_status === 'monitor').length,
    ok: stores.filter(s => s.price_status === 'ok').length,
  }

  return (
    <div className="flex flex-col gap-4 animate-fade-in" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Store Map</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>
            All 10 Short Trip locations — South Carolina
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Status Legend */}
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-2)' }}>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
              Alert ({statusCounts.alert})
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F97316', display: 'inline-block' }} />
              Monitor ({statusCounts.monitor})
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} />
              OK ({statusCounts.ok})
            </span>
          </div>
        </div>
      </div>

      {/* Map + Sidebar */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Map */}
        <div className="flex-1 rounded-2xl overflow-hidden relative"
          style={{ border: '1px solid var(--color-border)' }}>
          {loading || !leafletLoaded ? (
            <div className="flex items-center justify-center h-full"
              style={{ background: 'var(--color-surface)' }}>
              <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
            </div>
          ) : (
            <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: 400 }} />
          )}
        </div>

        {/* Store List Sidebar */}
        <div className="w-72 flex-shrink-0 rounded-2xl overflow-auto"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>
              Store List ({stores.length})
            </h2>
          </div>
          <div className="flex flex-col">
            {stores.map(store => {
              const diff = parseFloat(store.price_diff || 0)
              const isSelected = selected?.id === store.id
              const statusColor = store.price_status === 'alert' ? '#EF4444'
                : store.price_status === 'monitor' ? '#F97316'
                : store.price_status === 'ok' ? '#22C55E' : '#6B7280'

              return (
                <button
                  key={store.id}
                  onClick={() => {
                    setSelected(store)
                    if (mapInstanceRef.current && store.lat && store.lng) {
                      mapInstanceRef.current.setView([parseFloat(store.lat), parseFloat(store.lng)], 13, {
                        animate: true, duration: 0.5
                      })
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-left transition-all"
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: isSelected ? 'rgba(255,107,0,0.08)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
                  }}
                >
                  {/* Status dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0
                  }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                      {store.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                        ${parseFloat(store.our_price || 0).toFixed(3)}
                      </span>
                      {store.best_comp_price && (
                        <span className="text-xs font-semibold" style={{
                          color: diff < -0.05 ? '#EF4444' : diff < 0 ? '#F97316' : '#22C55E'
                        }}>
                          {diff > 0 ? '+' : ''}{diff.toFixed(3)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={12} style={{ color: 'var(--color-text-3)', flexShrink: 0 }} />
                </button>
              )
            })}
          </div>

          {/* View Detail button */}
          {selected && (
            <div className="p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={() => navigate(`/stores/${selected.id}`)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                View {selected.name} →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
