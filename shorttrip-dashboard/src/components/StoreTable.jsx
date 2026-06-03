import { useNavigate } from 'react-router-dom'
import AlertBadge from './AlertBadge'
import { Bell, Eye, TrendingDown, TrendingUp, Minus } from 'lucide-react'

export default function StoreTable({ stores = [], onNotify, loading }) {
  const navigate = useNavigate()

  const fmt = (v) => v != null ? `$${parseFloat(v).toFixed(3)}` : '—'
  const fmtDiff = (d) => {
    if (d == null) return '—'
    const n = parseFloat(d)
    const color = n < -0.05 ? '#EF4444' : n < 0 ? '#F97316' : '#22C55E'
    const icon = n < 0 ? <TrendingDown size={12} /> : n > 0 ? <TrendingUp size={12} /> : <Minus size={12} />
    return (
      <span className="flex items-center gap-1 font-semibold" style={{ color }}>
        {icon}{n > 0 ? '+' : ''}{n.toFixed(3)}
      </span>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
        <span className="text-sm" style={{ color: 'var(--color-text-3)' }}>Loading store data...</span>
      </div>
    </div>
  )

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
            {['Store', 'Our Price', 'Best Competitor', 'Difference', 'Status', 'Action'].map(h => (
              <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--color-text-3)' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stores.map((store, i) => (
            <tr
              key={store.id}
              className="table-row animate-fade-in"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {/* Store Name */}
              <td className="py-3.5 px-4">
                <div className="font-semibold text-sm leading-tight" style={{ color: 'var(--color-text)' }}>
                  {store.name}
                </div>
                {store.active_alerts > 0 && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-danger)' }}>
                    {store.active_alerts} active alert{store.active_alerts > 1 ? 's' : ''}
                  </div>
                )}
              </td>

              {/* Our Price */}
              <td className="py-3.5 px-4">
                <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>
                  {fmt(store.our_price)}
                </span>
              </td>

              {/* Best Competitor */}
              <td className="py-3.5 px-4">
                <div className="font-semibold" style={{ color: 'var(--color-text-2)' }}>
                  {store.best_comp_name
                    ? <>{store.best_comp_name} <span style={{ color: 'var(--color-text)' }}>{fmt(store.best_comp_price)}</span></>
                    : <span style={{ color: 'var(--color-text-3)' }}>No data</span>
                  }
                </div>
                {store.distance_mi && (
                  <div className="text-xs" style={{ color: 'var(--color-text-3)' }}>{store.distance_mi} mi away</div>
                )}
              </td>

              {/* Price Diff */}
              <td className="py-3.5 px-4">
                {fmtDiff(store.price_diff)}
              </td>

              {/* Status Badge */}
              <td className="py-3.5 px-4">
                <AlertBadge status={store.price_status || 'skip'} priority={store.active_alerts > 0 ? 'HIGH' : 'MED'} />
              </td>

              {/* Action Buttons */}
              <td className="py-3.5 px-4">
                <div className="flex items-center gap-2">
                  {store.price_status === 'alert' && (
                    <button
                      onClick={() => onNotify && onNotify(store)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      <Bell size={11} />
                      Notify
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/stores/${store.id}`)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-2)',
                      background: 'var(--color-surface-2)',
                    }}
                  >
                    <Eye size={11} />
                    View
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {stores.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-12" style={{ color: 'var(--color-text-3)' }}>
                No store data available yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
