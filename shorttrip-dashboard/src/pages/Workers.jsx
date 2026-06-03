import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X, Phone, User, Store } from 'lucide-react'
import { fetchWorkers, addWorker, updateWorker, deleteWorker } from '../api/priceApi'
import { fetchStores, MOCK_STORES } from '../api/priceApi'

const MOCK_WORKERS = [
  { id:1, store_id:1, store_name:'614 US-78, Ridgeville',    name:'John Smith',   phone:'+18438718119', channel:'whatsapp', active:true,  is_manager:false },
  { id:2, store_id:1, store_name:'614 US-78, Ridgeville',    name:'Mike Torres',  phone:'+18438718120', channel:'sms',       active:true,  is_manager:true  },
  { id:3, store_id:4, store_name:'3880 Patriot Pkwy, Sumter',name:'Sara Lee',     phone:'+18038938200', channel:'whatsapp', active:true,  is_manager:false },
  { id:4, store_id:3, store_name:'348 College Park, Ladson', name:'David Chen',   phone:'+18439711050', channel:'whatsapp', active:false, is_manager:false },
]

const BLANK = { store_id: '', name: '', phone: '', channel: 'whatsapp', is_manager: false }

export default function Workers() {
  const [workers, setWorkers]   = useState([])
  const [stores, setStores]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(BLANK)
  const [editId, setEditId]     = useState(null)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    Promise.all([fetchWorkers(), fetchStores()])
      .then(([w, s]) => { setWorkers(w.workers || []); setStores(s.stores || MOCK_STORES) })
      .catch(() => { setWorkers(MOCK_WORKERS); setStores(MOCK_STORES) })
      .finally(() => setLoading(false))
  }, [])

  const handleAdd = async () => {
    if (!form.store_id || !form.name || !form.phone) return
    setSaving(true)
    try {
      const res = await addWorker(form)
      const store = stores.find(s => s.id == form.store_id)
      setWorkers(w => [...w, { ...res.worker, store_name: store?.name }])
      setForm(BLANK); setShowForm(false)
    } catch { alert('Failed to add worker') }
    finally { setSaving(false) }
  }

  const handleToggle = async (id, active) => {
    try { await updateWorker(id, { active: !active }) } catch {}
    setWorkers(w => w.map(x => x.id === id ? { ...x, active: !active } : x))
  }

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this worker?')) return
    try { await deleteWorker(id) } catch {}
    setWorkers(w => w.filter(x => x.id !== id))
  }

  const channelIcon = { whatsapp: '📱', sms: '💬', email: '📧' }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Workers</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>
            Manage notification contacts per store
          </p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: 'var(--color-primary)' }}>
          <Plus size={14} /> Add Worker
        </button>
      </div>

      {/* Add Worker Form */}
      {showForm && (
        <div className="card animate-slide-in flex flex-col gap-4">
          <h2 className="font-bold" style={{ color: 'var(--color-text)' }}>New Worker</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-2)' }}>Store *</label>
              <select value={form.store_id} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))} className="input text-sm">
                <option value="">Select store...</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name.split(',')[0]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-2)' }}>Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input text-sm" placeholder="Worker name" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-2)' }}>Phone *</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input text-sm" placeholder="+1 (843) 000-0000" />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-2)' }}>Channel</label>
              <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))} className="input text-sm">
                <option value="whatsapp">📱 WhatsApp</option>
                <option value="sms">💬 SMS</option>
                <option value="email">📧 Email</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--color-primary)' }}>
              {saving ? 'Saving...' : 'Add Worker'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(BLANK) }}
              className="px-4 py-2 rounded-lg text-sm border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Workers Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {['Name', 'Store', 'Phone', 'Channel', 'Role', 'Status', 'Actions'].map(h => (
                <th key={h} className="text-left py-3 px-4 text-xs font-semibold uppercase"
                  style={{ color: 'var(--color-text-3)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12" style={{ color: 'var(--color-text-3)' }}>Loading...</td></tr>
            ) : workers.map((w, i) => (
              <tr key={w.id} className="table-row" style={{ opacity: w.active ? 1 : 0.5 }}>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: 'var(--color-accent)' }}>
                      {w.name.charAt(0)}
                    </div>
                    <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{w.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-xs" style={{ color: 'var(--color-text-2)' }}>
                  {(w.store_name || '').split(',')[0]}
                </td>
                <td className="py-3 px-4 font-mono text-xs" style={{ color: 'var(--color-text-2)' }}>{w.phone}</td>
                <td className="py-3 px-4">
                  <span className="badge badge-monitor">{channelIcon[w.channel]} {w.channel}</span>
                </td>
                <td className="py-3 px-4">
                  {w.is_manager
                    ? <span className="badge badge-ok">Manager</span>
                    : <span className="badge badge-skip">Worker</span>}
                </td>
                <td className="py-3 px-4">
                  <span className={`badge ${w.active ? 'badge-ok' : 'badge-skip'}`}>
                    {w.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => handleToggle(w.id, w.active)}
                      className="p-1.5 rounded-lg border transition-all"
                      style={{ borderColor: 'var(--color-border)', color: w.active ? '#F97316' : '#22C55E' }}
                      title={w.active ? 'Deactivate' : 'Activate'}>
                      {w.active ? <X size={12} /> : <Check size={12} />}
                    </button>
                    <button onClick={() => handleDelete(w.id)}
                      className="p-1.5 rounded-lg border transition-all"
                      style={{ borderColor: 'var(--color-border)', color: '#EF4444' }}
                      title="Remove">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.15)' }}>
        <p className="font-semibold mb-1" style={{ color: 'var(--color-accent)' }}>📢 Notification Channels</p>
        <p style={{ color: 'var(--color-text-2)' }}>
          Currently all alerts are shown on this dashboard. WhatsApp and SMS notifications can be enabled
          in <strong>Settings</strong> once credentials are configured.
        </p>
      </div>
    </div>
  )
}
