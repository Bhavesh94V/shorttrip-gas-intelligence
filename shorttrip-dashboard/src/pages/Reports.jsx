import { useState, useEffect } from 'react'
import { Download, FileText, Printer, RefreshCw, TrendingDown, CheckCircle, AlertTriangle } from 'lucide-react'
import api from '../api/priceApi'
import { MOCK_STORES } from '../api/priceApi'

const fmt = (n) => n != null ? `$${parseFloat(n).toFixed(3)}` : '—'
const fmtDiff = (d) => {
  if (d == null) return '—'
  const v = parseFloat(d)
  return (v > 0 ? '+' : '') + v.toFixed(3)
}

export default function Reports() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [days, setDays] = useState(7)

  const loadSummary = async () => {
    setLoading(true)
    try {
      const res = await api.get('/stores/export/summary')
      setSummary(res.data)
    } catch {
      // Mock fallback
      setSummary({
        generated_at: new Date().toISOString(),
        stores: MOCK_STORES.map(s => ({
          id: s.id, name: s.name, address: s.name,
          our_price: s.our_price,
          comp_price: s.best_comp_price,
          price_diff: s.price_diff,
          status: s.price_status,
          best_comp: s.best_comp_name,
          today_alerts: s.active_alerts || 0,
          unread_alerts: s.active_alerts || 0,
        })),
        totals: { total_alerts: 2, today_alerts: 4, avg_diff: '-0.045' }
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSummary() }, [])

  const handleCSVDownload = async () => {
    setDownloading(true)
    try {
      const res = await api.get(`/stores/export/csv?days=${days}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `shorttrip_prices_${new Date().toISOString().slice(0,10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('CSV export failed — check if backend is connected')
    } finally {
      setDownloading(false)
    }
  }

  const handlePrint = () => window.print()

  const stores = summary?.stores || []
  const totals = summary?.totals || {}
  const alertStores   = stores.filter(s => s.status === 'alert').length
  const okStores      = stores.filter(s => s.status === 'ok').length
  const monitorStores = stores.filter(s => s.status === 'monitor').length

  return (
    <div className="flex flex-col gap-6 animate-fade-in" id="report-printable">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Reports & Export</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>
            {summary ? `Generated: ${new Date(summary.generated_at).toLocaleString()}` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap no-print">
          <button onClick={loadSummary} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)', background: 'var(--color-surface)' }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)', background: 'var(--color-surface)' }}>
            <Printer size={13} /> Print
          </button>
          <div className="flex items-center gap-1.5">
            <select value={days} onChange={e => setDays(parseInt(e.target.value))}
              className="input text-xs" style={{ width: 100, padding: '6px 10px' }}>
              <option value={1}>Last 1 day</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <button onClick={handleCSVDownload} disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
              style={{ background: downloading ? 'var(--color-text-3)' : 'var(--color-accent)' }}>
              <Download size={13} /> {downloading ? 'Downloading...' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Alert Stores',   value: alertStores,            color: '#EF4444', icon: AlertTriangle },
          { label: 'Monitor Stores', value: monitorStores,          color: '#F97316', icon: TrendingDown },
          { label: 'OK Stores',      value: okStores,               color: '#22C55E', icon: CheckCircle },
          { label: "Today's Alerts", value: totals.today_alerts||0, color: 'var(--color-accent)', icon: FileText },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card text-center" style={{ borderTop: `3px solid ${color}`, padding: 16 }}>
            <Icon size={18} className="mx-auto mb-2" style={{ color }} />
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-3)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Full Store Report Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--color-border)' }}>
          <h2 className="font-bold" style={{ color: 'var(--color-text)' }}>
            Full Store Price Report — {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
                {['#', 'Store', 'Our Price', 'Best Competitor', 'Comp Price', 'Difference', 'Status', "Today's Alerts"].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase"
                    style={{ color: 'var(--color-text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10"
                  style={{ color: 'var(--color-text-3)' }}>Loading...</td></tr>
              ) : stores.map((store, i) => {
                const diff = parseFloat(store.price_diff || 0)
                const statusColor = store.status === 'alert' ? '#EF4444'
                  : store.status === 'monitor' ? '#F97316'
                  : store.status === 'ok' ? '#22C55E' : '#6B7280'
                const diffColor = diff < -0.05 ? '#EF4444' : diff < 0 ? '#F97316' : '#22C55E'

                return (
                  <tr key={store.id} className="table-row">
                    <td className="py-3 px-4 text-xs font-bold" style={{ color: 'var(--color-text-3)' }}>{i + 1}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-xs" style={{ color: 'var(--color-text)' }}>
                        {store.name?.split(',')[0]}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--color-text-3)' }}>
                        {store.address?.split(',').slice(1).join(',').trim() || ''}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-bold" style={{ color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                      {fmt(store.our_price)}
                    </td>
                    <td className="py-3 px-4 text-xs" style={{ color: 'var(--color-text-2)', whiteSpace: 'nowrap' }}>
                      {store.best_comp || '—'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-xs" style={{ whiteSpace: 'nowrap' }}>
                      {fmt(store.comp_price)}
                    </td>
                    <td className="py-3 px-4 font-bold text-xs" style={{ color: diffColor, whiteSpace: 'nowrap' }}>
                      {fmtDiff(store.price_diff)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge badge-${store.status || 'skip'}`} style={{ whiteSpace: 'nowrap' }}>
                        {store.status?.toUpperCase() || 'NO DATA'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {parseInt(store.today_alerts) > 0 ? (
                        <span className="font-bold text-sm" style={{ color: '#EF4444' }}>
                          {store.today_alerts}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-3)' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Footer */}
      <div className="print-only text-xs text-center" style={{ color: '#666', marginTop: 8 }}>
        Short Trip Gas Price Intelligence — GarudX.AI | Generated {new Date().toLocaleString()}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .card { box-shadow: none !important; border: 1px solid #ddd !important; }
        }
        .print-only { display: none; }
      `}</style>
    </div>
  )
}
