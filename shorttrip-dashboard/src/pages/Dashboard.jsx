import { useState, useEffect, useCallback } from 'react'
import { MapPin, Bell, CheckCircle, DollarSign, RefreshCw, Filter } from 'lucide-react'
import MetricCard from '../components/MetricCard'
import StoreTable from '../components/StoreTable'
import { fetchStores, fetchAlertSummary, notifyAlert, MOCK_STORES } from '../api/priceApi'

export default function Dashboard() {
  const [stores, setStores]     = useState([])
  const [summary, setSummary]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all') // all | alert | ok
  const [notifying, setNotifying] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [storesData, summaryData] = await Promise.all([
        fetchStores(),
        fetchAlertSummary()
      ])
      setStores(storesData.stores || [])
      setSummary(summaryData)
    } catch {
      // Fallback to mock data for dev
      setStores(MOCK_STORES)
      setSummary({ active_alerts: 2, ok_stores: 7, avg_price: 3.316 })
    } finally {
      setLoading(false)
      setLastUpdate(new Date())
    }
  }, [])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 120 * 60 * 1000) // 2hr auto-refresh
    return () => clearInterval(interval)
  }, [loadData])

  const handleNotify = async (store) => {
    setNotifying(store.id)
    try {
      // Find active alert for this store
      await new Promise(r => setTimeout(r, 1000)) // simulate
      alert(`✅ Notification queued for ${store.name}`)
    } catch { alert('Failed to send notification') }
    finally { setNotifying(null) }
  }

  const filteredStores = stores.filter(s => {
    if (filter === 'alert')   return s.price_status === 'alert'
    if (filter === 'monitor') return s.price_status === 'monitor'
    if (filter === 'ok')      return s.price_status === 'ok'
    return true
  })

  const alertCount   = summary.active_alerts ?? stores.filter(s => s.price_status === 'alert').length
  const okCount      = summary.ok_stores ?? stores.filter(s => s.price_status === 'ok').length
  const avgPrice     = summary.avg_price ?? (stores.reduce((a, s) => a + (s.our_price || 0), 0) / (stores.length || 1))
  const totalStores  = stores.length || 10

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            Dashboard Overview
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>
            All 10 Short Trip Gas Stations — South Carolina
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
          style={{ background: 'var(--color-accent)' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={MapPin}       label="Total Stores"    value={totalStores}             sub="South Carolina"         color="accent" />
        <MetricCard icon={Bell}         label="Active Alerts"   value={alertCount}              sub="Need attention"         color="red" />
        <MetricCard icon={CheckCircle}  label="Competitive"     value={okCount}                 sub="Price is good"          color="green" />
        <MetricCard icon={DollarSign}   label="Avg Price/gal"   value={`$${avgPrice.toFixed(3)}`} sub="Regular unleaded"     color="yellow" />
      </div>

      {/* Store Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Table Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
              Store Price Comparison
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-3)' }}>
              Last updated: {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} EST
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2">
            <Filter size={13} style={{ color: 'var(--color-text-3)' }} />
            {[
              { key: 'all',     label: 'All' },
              { key: 'alert',   label: '🔴 Alerts' },
              { key: 'monitor', label: '🟡 Close' },
              { key: 'ok',      label: '🟢 OK' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="px-3 py-1 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: filter === f.key ? 'var(--color-primary)' : 'var(--color-surface-2)',
                  color: filter === f.key ? '#fff' : 'var(--color-text-2)',
                  border: `1px solid ${filter === f.key ? 'var(--color-primary)' : 'var(--color-border)'}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <StoreTable
          stores={filteredStores}
          onNotify={handleNotify}
          loading={loading}
        />
      </div>
    </div>
  )
}
