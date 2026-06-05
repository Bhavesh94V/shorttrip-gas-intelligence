import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCircle, AlertTriangle, Clock, Eye } from 'lucide-react'
import AlertBadge from '../components/AlertBadge'
import { fetchAlerts, acknowledgeAlert, acknowledgeAllAlerts, notifyAlert, MOCK_STORES } from '../api/priceApi'

export default function Alerts() {
  const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('unread') // unread | all | high
  const navigate = useNavigate()

  const mockAlerts = [
    { id:1, store_name:'614 US-78, Ridgeville',    store_id:1, comp_name:'Shell',   our_price:3.350, comp_price:3.190, diff:0.160, priority:'HIGH', acknowledged:false, created_at: new Date(Date.now()-3600000).toISOString() },
    { id:2, store_name:'3880 Patriot Pkwy, Sumter',store_id:4, comp_name:'Chevron', our_price:3.410, comp_price:3.290, diff:0.120, priority:'HIGH', acknowledged:false, created_at: new Date(Date.now()-7200000).toISOString() },
    { id:3, store_name:'3147 State Rd, Ridgeville', store_id:2, comp_name:'BP',      our_price:3.280, comp_price:3.210, diff:0.070, priority:'MED',  acknowledged:false, created_at: new Date(Date.now()-10800000).toISOString() },
    { id:4, store_name:'3995 North Rd, Orangeburg', store_id:9, comp_name:'Shell',   our_price:3.300, comp_price:3.240, diff:0.060, priority:'MED',  acknowledged:true,  created_at: new Date(Date.now()-86400000).toISOString() },
  ]

  const loadAlerts = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter === 'unread') params.acknowledged = false
      if (filter === 'high') { params.acknowledged = false; params.priority = 'HIGH' }
      const data = await fetchAlerts(params)
      setAlerts(data.alerts || [])
    } catch { setAlerts(mockAlerts) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadAlerts() }, [filter])

  const handleAck = async (id) => {
    try { await acknowledgeAlert(id) } catch {}
    setAlerts(a => a.map(x => x.id === id ? { ...x, acknowledged: true } : x))
  }

  const handleAckAll = async () => {
    try { await acknowledgeAllAlerts() } catch {}
    setAlerts(a => a.map(x => ({ ...x, acknowledged: true })))
  }

  const [notifyStatus, setNotifyStatus] = useState({}) // { alertId: 'sending' | 'sent' | 'error' }

  const handleNotify = async (alertItem) => {
    setNotifyStatus(s => ({ ...s, [alertItem.id]: 'sending' }))
    try {
      await notifyAlert(alertItem.id)
      setNotifyStatus(s => ({ ...s, [alertItem.id]: 'sent' }))
      setTimeout(() => setNotifyStatus(s => { const n = {...s}; delete n[alertItem.id]; return n }), 3000)
    } catch {
      setNotifyStatus(s => ({ ...s, [alertItem.id]: 'error' }))
      setTimeout(() => setNotifyStatus(s => { const n = {...s}; delete n[alertItem.id]; return n }), 3000)
    }
  }

  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs/24)}d ago`
  }

  const unreadCount = alerts.filter(a => !a.acknowledged).length

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Active Alerts</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>
            {unreadCount} unread alert{unreadCount !== 1 ? 's' : ''} — price action needed
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={handleAckAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all hover:opacity-80"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)', background: 'var(--color-surface)' }}>
            <CheckCircle size={14} /> Mark All Read
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: 'unread', label: 'Unread', icon: Bell },
          { key: 'high',   label: 'HIGH Priority', icon: AlertTriangle },
          { key: 'all',    label: 'All Alerts', icon: Clock },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setFilter(key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: filter === key ? 'var(--color-primary)' : 'var(--color-surface)',
              color: filter === key ? '#fff' : 'var(--color-text-2)',
              border: `1px solid ${filter === key ? 'var(--color-primary)' : 'var(--color-border)'}`,
            }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Alert Cards */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : alerts.length === 0 ? (
          <div className="card text-center py-12">
            <CheckCircle size={32} className="mx-auto mb-3" style={{ color: 'var(--color-success)' }} />
            <p className="font-semibold" style={{ color: 'var(--color-text)' }}>All clear!</p>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-3)' }}>No alerts at this time</p>
          </div>
        ) : alerts.map((alert, i) => (
          <div key={alert.id}
            className="card flex items-center gap-4 animate-fade-in"
            style={{
              animationDelay: `${i * 40}ms`,
              opacity: alert.acknowledged ? 0.6 : 1,
              borderLeft: alert.acknowledged ? '3px solid var(--color-border)' : `3px solid ${alert.priority === 'HIGH' ? 'var(--color-danger)' : 'var(--color-warning)'}`,
            }}>

            {/* Priority Icon */}
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: alert.priority === 'HIGH' ? 'rgba(239,68,68,0.12)' : 'rgba(249,115,22,0.12)' }}>
              <AlertTriangle size={18} style={{ color: alert.priority === 'HIGH' ? '#EF4444' : '#F97316' }} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{alert.store_name}</span>
                <AlertBadge status="alert" priority={alert.priority} size="xs" />
              </div>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                <span className="font-semibold" style={{ color: 'var(--color-danger)' }}>{alert.comp_name}</span>
                {' '}at ${parseFloat(alert.comp_price).toFixed(3)} vs your ${parseFloat(alert.our_price).toFixed(3)}
                {' '}— <span className="font-bold">${parseFloat(alert.diff).toFixed(3)} cheaper</span>
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-3)' }}>{timeAgo(alert.created_at)}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {!alert.acknowledged && (
                <button onClick={() => handleNotify(alert)}
                  disabled={notifyStatus[alert.id] === 'sending'}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                  style={{
                    background: notifyStatus[alert.id] === 'sent' ? '#22C55E'
                      : notifyStatus[alert.id] === 'error' ? '#EF4444'
                      : 'var(--color-primary)'
                  }}>
                  <Bell size={11} />
                  {notifyStatus[alert.id] === 'sending' ? 'Sending...'
                    : notifyStatus[alert.id] === 'sent' ? 'Sent ✓'
                    : notifyStatus[alert.id] === 'error' ? 'Failed'
                    : 'Notify'}
                </button>
              )}
              <button onClick={() => navigate(`/stores/${alert.store_id}`)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}>
                <Eye size={11} />View
              </button>
              {!alert.acknowledged && (
                <button onClick={() => handleAck(alert.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-3)' }}>
                  <CheckCircle size={11} />Done
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
