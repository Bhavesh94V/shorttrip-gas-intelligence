import { useState, useEffect } from 'react'
import { History as HistoryIcon, Filter } from 'lucide-react'
import PriceChart from '../components/PriceChart'
import { fetchChartData, fetchStores, MOCK_STORES } from '../api/priceApi'

const MOCK_CHART = MOCK_STORES.flatMap(store =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return {
      date: d.toISOString().split('T')[0],
      store_name: store.name.split(',')[0],
      our_price: (store.our_price + (Math.random() - 0.5) * 0.04).toFixed(3)
    }
  })
)

export default function History() {
  const [chartData, setChartData] = useState([])
  const [stores, setStores]       = useState([])
  const [storeId, setStoreId]     = useState('')
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetchStores().then(d => setStores(d.stores || MOCK_STORES)).catch(() => setStores(MOCK_STORES))
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchChartData(storeId || null)
      .then(d => setChartData(d.chart_data?.flatMap(s => s.data.map(r => ({ ...r, store_name: s.store_name }))) || []))
      .catch(() => setChartData(MOCK_CHART))
      .finally(() => setLoading(false))
  }, [storeId])

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Price History</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>7-day price trend across all stores</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} style={{ color: 'var(--color-text-3)' }} />
          <select value={storeId} onChange={e => setStoreId(e.target.value)} className="input text-sm" style={{ width: 200 }}>
            <option value="">All Stores</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name.split(',')[0]}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <h2 className="font-bold text-base mb-4" style={{ color: 'var(--color-text)' }}>
          {storeId ? `${stores.find(s => s.id == storeId)?.name || 'Store'} — Price Trend` : 'All Stores — Price Trend'}
        </h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <PriceChart data={chartData} height={340} showLegend={!storeId} />
        )}
      </div>

      {/* Summary Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>Today's Snapshot</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Store', 'Our Price', 'Competitor', 'Diff', 'Status'].map(h => (
                <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase"
                  style={{ color: 'var(--color-text-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_STORES.map((store, i) => {
              const diff = parseFloat(store.price_diff || 0)
              return (
                <tr key={store.id} className="table-row">
                  <td className="py-3 px-4 font-medium" style={{ color: 'var(--color-text)' }}>{store.name.split(',')[0]}</td>
                  <td className="py-3 px-4 font-bold" style={{ color: 'var(--color-text)' }}>${parseFloat(store.our_price).toFixed(3)}</td>
                  <td className="py-3 px-4" style={{ color: 'var(--color-text-2)' }}>
                    {store.best_comp_name} ${parseFloat(store.best_comp_price || 0).toFixed(3)}
                  </td>
                  <td className="py-3 px-4 font-semibold"
                    style={{ color: diff < -0.05 ? '#EF4444' : diff < 0 ? '#F97316' : '#22C55E' }}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(3)}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`badge badge-${store.price_status || 'skip'}`}>
                      {store.price_status?.toUpperCase() || 'NO DATA'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
