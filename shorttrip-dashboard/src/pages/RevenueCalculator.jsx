import { useState, useEffect } from 'react'
import { TrendingDown, DollarSign, Fuel, AlertTriangle, Calculator, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fetchStores, MOCK_STORES } from '../api/priceApi'

// Revenue impact calculation
const calcImpact = (priceDiff, gallonsPerDay) => {
  const diffAbs = Math.abs(parseFloat(priceDiff || 0))
  const gpd = parseFloat(gallonsPerDay || 1500)
  const daily = diffAbs * gpd
  const weekly = daily * 7
  const monthly = daily * 30
  const yearly = daily * 365
  return { daily, weekly, monthly, yearly }
}

const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function RevenueCalculator() {
  const navigate = useNavigate()
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [gallons, setGallons] = useState(1500) // default gallons/day per store

  useEffect(() => {
    fetchStores()
      .then(d => setStores(d.stores || []))
      .catch(() => setStores(MOCK_STORES))
      .finally(() => setLoading(false))
  }, [])

  // Only show stores with competitor price data and negative diff (we're more expensive)
  const alertStores = stores.filter(s => s.price_diff && parseFloat(s.price_diff) < 0)
  const monitorStores = stores.filter(s => s.price_diff && parseFloat(s.price_diff) >= -0.05 && parseFloat(s.price_diff) < 0)

  // Total impact across all alert stores
  const totalDailyLoss = alertStores.reduce((sum, s) => {
    return sum + calcImpact(s.price_diff, gallons).daily
  }, 0)

  const totalMonthlyLoss = totalDailyLoss * 30
  const totalYearlyLoss = totalDailyLoss * 365

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Revenue Impact Calculator</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>
          Estimated revenue lost when competitors are cheaper than you
        </p>
      </div>

      {/* Gallons/day input */}
      <div className="card flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,107,0,0.12)' }}>
            <Fuel size={18} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Gallons Sold Per Day</p>
            <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>Per store average (adjust for your volume)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-1">
          <input
            type="range" min="500" max="5000" step="100"
            value={gallons}
            onChange={e => setGallons(parseInt(e.target.value))}
            className="flex-1"
            style={{ accentColor: 'var(--color-accent)' }}
          />
          <div className="rounded-xl px-4 py-2 font-bold text-lg min-w-[100px] text-center"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-accent)' }}>
            {gallons.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Total Impact Summary */}
      {alertStores.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Daily Loss', value: fmt(totalDailyLoss), color: '#F97316', sub: 'across all alert stores' },
            { label: 'Monthly Loss', value: fmt(totalMonthlyLoss), color: '#EF4444', sub: 'if prices not adjusted' },
            { label: 'Yearly Loss', value: fmt(totalYearlyLoss), color: '#DC2626', sub: 'projected annual impact' },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="card text-center"
              style={{ borderTop: `3px solid ${color}` }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                style={{ color: 'var(--color-text-3)' }}>{label}</p>
              <p className="text-3xl font-black" style={{ color }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-3)' }}>{sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* No data state */}
      {!loading && alertStores.length === 0 && (
        <div className="card text-center py-10">
          <DollarSign size={32} className="mx-auto mb-3" style={{ color: '#22C55E', opacity: 0.5 }} />
          <p className="font-semibold" style={{ color: 'var(--color-text)' }}>All stores are competitive! 🎉</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-3)' }}>
            No stores are currently more expensive than competitors.
          </p>
        </div>
      )}

      {/* Per-Store Breakdown */}
      {alertStores.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <h2 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
              Store-by-Store Breakdown
              <span className="ml-2 text-sm font-normal" style={{ color: 'var(--color-text-3)' }}>
                ({alertStores.length} stores losing revenue)
              </span>
            </h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {['Store', 'Our Price', 'Competitor', 'Diff', 'Daily Loss', 'Monthly Loss', 'Action'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase"
                      style={{ color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alertStores.map((store, i) => {
                  const diff = parseFloat(store.price_diff || 0)
                  const impact = calcImpact(diff, gallons)
                  const severity = diff < -0.10 ? '#EF4444' : diff < -0.05 ? '#F97316' : '#FBBF24'
                  return (
                    <tr key={store.id} className="table-row" style={{ animationDelay: `${i * 30}ms` }}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: severity, flexShrink: 0 }} />
                          <span className="font-semibold text-xs" style={{ color: 'var(--color-text)' }}>
                            {store.name?.split(',')[0]}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-bold" style={{ color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                        ${parseFloat(store.our_price || 0).toFixed(3)}
                      </td>
                      <td className="py-3 px-4" style={{ color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>
                        {store.best_comp_name || '—'} ${parseFloat(store.best_comp_price || 0).toFixed(3)}
                      </td>
                      <td className="py-3 px-4 font-bold" style={{ color: severity, whiteSpace: 'nowrap' }}>
                        {diff.toFixed(3)}/gal
                      </td>
                      <td className="py-3 px-4 font-bold" style={{ color: '#F97316', whiteSpace: 'nowrap' }}>
                        {fmt(impact.daily)}
                      </td>
                      <td className="py-3 px-4 font-bold" style={{ color: '#EF4444', whiteSpace: 'nowrap' }}>
                        {fmt(impact.monthly)}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => navigate(`/stores/${store.id}`)}
                          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
                          style={{ background: 'var(--color-primary)', color: '#fff' }}
                        >
                          Fix Price <ChevronRight size={11} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
                  <td className="py-3 px-4 font-bold text-xs uppercase" colSpan={4}
                    style={{ color: 'var(--color-text-3)' }}>TOTAL</td>
                  <td className="py-3 px-4 font-black" style={{ color: '#F97316' }}>{fmt(totalDailyLoss)}</td>
                  <td className="py-3 px-4 font-black" style={{ color: '#EF4444' }}>{fmt(totalMonthlyLoss)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* How it's calculated */}
      <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.15)' }}>
        <p className="font-semibold mb-1" style={{ color: 'var(--color-accent)' }}>📊 How This Is Calculated</p>
        <p style={{ color: 'var(--color-text-2)' }}>
          <strong>Formula:</strong> Daily Loss = |Price Difference| × Gallons Per Day
          <br />
          <span style={{ color: 'var(--color-text-3)', fontSize: 12 }}>
            Example: $0.10 cheaper competitor × 1,500 gal/day = <strong>$150/day = $4,500/month</strong> lost revenue
          </span>
        </p>
      </div>
    </div>
  )
}
