import { useState, useEffect, useCallback } from 'react'
import { MapPin, Bell, CheckCircle, DollarSign, RefreshCw, Filter, TrendingDown, ChevronRight } from 'lucide-react'
import MetricCard from '../components/MetricCard'
import StoreTable from '../components/StoreTable'
import { fetchStores, fetchAlertSummary, fetchAlerts, notifyAlert, MOCK_STORES } from '../api/priceApi'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const navigate = useNavigate()
  const [stores, setStores]     = useState([])
  const [summary, setSummary]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('all') // all | alert | ok
  const [notifying, setNotifying] = useState(null)
  const [toast, setToast]         = useState(null)  // { msg, type }
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

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
      // Find active alert for this store and notify
      const alertsData = await fetchAlerts({ store_id: store.id, acknowledged: false })
      const activeAlert = alertsData?.alerts?.[0]
      if (activeAlert) {
        await notifyAlert(activeAlert.id)
        showToast(`✅ Notification sent for ${store.name.split(',')[0]}`)
      } else {
        showToast(`ℹ️ No active alert for ${store.name.split(',')[0]}`, 'info')
      }
    } catch {
      showToast(`❌ Failed to send notification`, 'error')
    } finally {
      setNotifying(null)
    }
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
    <div className="flex flex-col gap-6 animate-fade-in" style={{ position: 'relative' }}>

      {/* Toast Notification */}
      {toast && (
        <div
          className="animate-slide-in"
          style={{
            position: 'fixed', top: 20, right: 20, zIndex: 9999,
            padding: '12px 20px', borderRadius: 12,
            background: toast.type === 'error' ? '#EF4444'
              : toast.type === 'info' ? 'var(--color-accent)'
              : '#22C55E',
            color: '#fff', fontWeight: 600, fontSize: 14,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            maxWidth: 340,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            Dashboard Overview
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>
            All 10 Short Trip Gas Stations — South Carolina
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs hidden sm:block" style={{ color: 'var(--color-text-3)' }}>
            Updated {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'var(--color-accent)' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{loading ? 'Loading...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Revenue Impact Banner — shows when stores have alerts */}
      {alertCount > 0 && (
        <button
          onClick={() => navigate('/revenue')}
          className="flex items-center justify-between px-5 py-3 rounded-xl text-left transition-all hover:opacity-90 animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(249,115,22,0.10))',
            border: '1px solid rgba(239,68,68,0.25)',
          }}
        >
          <div className="flex items-center gap-3">
            <TrendingDown size={18} style={{ color: '#EF4444' }} />
            <div>
              <p className="text-sm font-bold" style={{ color: '#EF4444' }}>
                {alertCount} store{alertCount > 1 ? 's are' : ' is'} losing revenue to cheaper competitors
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>
                Click to see revenue impact calculator →
              </p>
            </div>
          </div>
          <ChevronRight size={16} style={{ color: '#EF4444', flexShrink: 0 }} />
        </button>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard icon={MapPin}       label="Total Stores"    value={totalStores}               sub="South Carolina"       color="accent" />
        <MetricCard icon={Bell}         label="Active Alerts"   value={alertCount}                sub="Need attention"       color="red" />
        <MetricCard icon={CheckCircle}  label="Competitive"     value={okCount}                   sub="Price is good"        color="green" />
        <MetricCard icon={DollarSign}   label="Avg Price/gal"   value={`$${avgPrice.toFixed(3)}`} sub="Regular unleaded"     color="yellow" />
      </div>

      {/* Store Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Table Header */}
        <div className="flex flex-wrap items-center justify-between px-4 sm:px-5 py-4 gap-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
              Store Price Comparison
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-3)' }}>
              {filteredStores.length} of {totalStores} stores shown
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Filter size={12} style={{ color: 'var(--color-text-3)' }} />
            {[
              { key: 'all',     label: 'All' },
              { key: 'alert',   label: '🔴 Alerts' },
              { key: 'monitor', label: '🟡 Close' },
              { key: 'ok',      label: '🟢 OK' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
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
          notifying={notifying}
        />
      </div>
    </div>
  )
}
