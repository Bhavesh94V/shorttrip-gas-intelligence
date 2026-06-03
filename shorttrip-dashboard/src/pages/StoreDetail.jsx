import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Clock, Phone, Navigation, ExternalLink, RefreshCw, Map } from 'lucide-react'
import AlertBadge from '../components/AlertBadge'
import PriceChart from '../components/PriceChart'
import { fetchStore, updateStorePrice, triggerStoreCheck } from '../api/priceApi'

// Google Maps helper functions
const mapsSearchUrl   = (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
const mapsDirectionUrl = (fromLat, fromLng, toLat, toLng, toName) => {
  if (fromLat && fromLng && toLat && toLng) {
    return `https://www.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(toName)}`
}

export default function StoreDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [editPrice, setEditPrice] = useState('')
  const [saving, setSaving]       = useState(false)
  const [syncing, setSyncing]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState('')

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchStore(id)
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const handlePriceUpdate = async () => {
    if (!editPrice) return
    setSaving(true)
    try {
      await updateStorePrice(id, editPrice)
      setData(d => ({ ...d, store: { ...d.store, our_price: parseFloat(editPrice) } }))
      setEditPrice('')
    } catch { alert('Failed to update price') }
    finally { setSaving(false) }
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('Triggering price check...')
    try {
      await triggerStoreCheck(id)
      setSyncMsg('✅ Price check triggered! Refresh in 30s.')
      setTimeout(() => setSyncMsg(''), 8000)
    } catch {
      setSyncMsg('⚠️ Could not reach Python engine.')
      setTimeout(() => setSyncMsg(''), 4000)
    }
    setSyncing(false)
  }

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (error) return (
    <div className="card text-center py-12">
      <p style={{ color: '#EF4444' }}>Failed to load store: {error}</p>
    </div>
  )

  const { store, competitors = [], price_history = [] } = data || {}

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Back + Header */}
      <div>
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm mb-3 transition-all hover:opacity-70"
          style={{ color: 'var(--color-text-3)' }}>
          <ArrowLeft size={14} /> Back to Stores
        </button>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{store?.name}</h1>
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              {store?.address && (
                <a href={mapsSearchUrl(store.address)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-sm hover:underline transition-all"
                  style={{ color: 'var(--color-accent)' }}>
                  <MapPin size={13} />{store.address}
                  <ExternalLink size={10} />
                </a>
              )}
              {store?.hours && <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--color-text-3)' }}>
                <Clock size={13} />{store.hours}
              </span>}
              {store?.phone && <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--color-text-3)' }}>
                <Phone size={13} />{store.phone}
              </span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View on Google Maps */}
            {store?.lat && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`}
                target="_blank" rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                <Map size={13} /> View on Map
              </a>
            )}
            <button onClick={handleSync} disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'var(--color-accent)' }}>
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Checking...' : 'Check Prices Now'}
            </button>
          </div>
        </div>
        {syncMsg && (
          <div className="mt-2 text-sm px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,107,0,0.08)', color: 'var(--color-text-2)', border: '1px solid rgba(255,107,0,0.2)' }}>
            {syncMsg}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Our Price + Competitors */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Our Price Update */}
          <div className="card">
            <h2 className="font-bold text-base mb-4" style={{ color: 'var(--color-text)' }}>Our Current Price</h2>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="text-4xl font-black" style={{ color: 'var(--color-primary)' }}>
                ${parseFloat(store?.our_price || 0).toFixed(3)}
                <span className="text-lg font-normal ml-1" style={{ color: 'var(--color-text-3)' }}>/gal</span>
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-48">
                <input
                  type="number" step="0.001" min="2" max="6"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  placeholder="Update price..."
                  className="input text-sm"
                  style={{ maxWidth: 140 }}
                />
                <button onClick={handlePriceUpdate} disabled={saving || !editPrice}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                  style={{ background: editPrice ? 'var(--color-primary)' : 'var(--color-border)', color: editPrice ? '#fff' : 'var(--color-text-3)' }}>
                  {saving ? 'Saving...' : 'Update'}
                </button>
              </div>
            </div>
          </div>

          {/* Competitors — ALL, no limit */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h2 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
                Nearby Competitors
                <span className="ml-2 text-sm font-normal" style={{ color: 'var(--color-text-3)' }}>
                  ({competitors.length} found)
                </span>
              </h2>
              {competitors.length === 0 && (
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-3)' }}>
                  No competitors found yet. Click "Check Prices Now" to discover nearby stations.
                </p>
              )}
            </div>
            {competitors.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {['Station', 'Distance', 'Price', 'vs Ours', 'Status', 'Directions'].map(h => (
                        <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase"
                          style={{ color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((c, i) => {
                      const diff     = parseFloat(c.price_diff || 0)
                      const price    = parseFloat(c.latest_price || c.comp_price || 0)
                      const distMi   = c.distance_mi ? parseFloat(c.distance_mi).toFixed(2) : '—'
                      const dirUrl   = mapsDirectionUrl(store?.lat, store?.lng, c.lat, c.lng, c.name + ' gas station')
                      return (
                        <tr key={c.id || i} className="table-row">
                          <td className="py-3 px-4 font-semibold" style={{ color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            {c.name}
                            {c.brand && c.brand !== c.name && (
                              <span className="ml-1 text-xs" style={{ color: 'var(--color-text-3)' }}>({c.brand})</span>
                            )}
                          </td>
                          <td className="py-3 px-4" style={{ color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>
                            📍 {distMi} mi
                          </td>
                          <td className="py-3 px-4 font-bold" style={{ color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            {price > 0 ? `$${price.toFixed(3)}` : <span style={{ color: 'var(--color-text-3)' }}>No data</span>}
                          </td>
                          <td className="py-3 px-4 font-semibold" style={{
                            color: diff < -0.05 ? '#EF4444' : diff < 0 ? '#F97316' : '#22C55E',
                            whiteSpace: 'nowrap'
                          }}>
                            {price > 0 ? (diff > 0 ? '+' : '') + diff.toFixed(3) : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <AlertBadge status={c.status || (diff < -0.05 ? 'alert' : diff < 0 ? 'monitor' : 'ok')} size="xs" />
                          </td>
                          <td className="py-3 px-4">
                            <a href={dirUrl} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                              style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.2)', whiteSpace: 'nowrap' }}>
                              <Navigation size={11} /> Directions
                            </a>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right — Price History Chart */}
        <div className="card">
          <h2 className="font-bold text-base mb-4" style={{ color: 'var(--color-text)' }}>7-Day Price History</h2>
          {price_history.length > 0
            ? <PriceChart data={price_history} height={220} showLegend={false} />
            : <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: 'var(--color-text-3)' }}>
                <RefreshCw size={28} style={{ opacity: 0.3 }} />
                <p className="text-sm">No history yet. Run a price check first.</p>
              </div>
          }
        </div>
      </div>
    </div>
  )
}
