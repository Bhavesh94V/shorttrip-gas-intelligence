import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, MapPin } from 'lucide-react'
import AlertBadge from '../components/AlertBadge'
import { fetchStores, updateStorePrice, MOCK_STORES } from '../api/priceApi'

export default function AllStores() {
  const navigate = useNavigate()
  const [stores, setStores]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [editId, setEditId]   = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    fetchStores()
      .then(d => setStores(d.stores || []))
      .catch(() => setStores(MOCK_STORES))
      .finally(() => setLoading(false))
  }, [])

  const filtered = stores.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleSavePrice = async (id) => {
    if (!editVal) return
    setSaving(true)
    try {
      await updateStorePrice(id, editVal)
      setStores(s => s.map(x => x.id === id ? { ...x, our_price: parseFloat(editVal) } : x))
      setEditId(null); setEditVal('')
    } catch { alert('Failed to update price') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>All Stores</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>
            Manage prices for all 10 Short Trip locations
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--color-text-3)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search stores..."
            className="input pl-8 text-sm" style={{ width: 220 }} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? Array(6).fill(0).map((_, i) => (
          <div key={i} className="card h-44 animate-pulse" style={{ background: 'var(--color-surface-2)' }} />
        )) : filtered.map((store, i) => {
          const isEditing = editId === store.id
          const diff = parseFloat(store.price_diff || 0)
          return (
            <div key={store.id}
              className="card flex flex-col gap-3 animate-fade-in hover:scale-[1.01] transition-transform"
              style={{ animationDelay: `${i * 30}ms` }}>
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,107,0,0.12)' }}>
                    <MapPin size={14} style={{ color: 'var(--color-accent)' }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--color-text)' }}>
                      {store.name}
                    </p>
                  </div>
                </div>
                <AlertBadge status={store.price_status || 'skip'} size="xs" />
              </div>

              {/* Prices */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>Our Price</p>
                  <p className="text-xl font-black" style={{ color: 'var(--color-primary)' }}>
                    ${parseFloat(store.our_price || 0).toFixed(3)}
                  </p>
                </div>
                {store.best_comp_name && (
                  <div className="text-right">
                    <p className="text-xs" style={{ color: 'var(--color-text-3)' }}>{store.best_comp_name}</p>
                    <p className="text-xl font-black" style={{ color: diff < -0.05 ? '#EF4444' : '#22C55E' }}>
                      ${parseFloat(store.best_comp_price || 0).toFixed(3)}
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Price Edit */}
              {isEditing ? (
                <div className="flex gap-2">
                  <input type="number" step="0.001" value={editVal} onChange={e => setEditVal(e.target.value)}
                    className="input text-sm flex-1" placeholder="New price..." autoFocus />
                  <button onClick={() => handleSavePrice(store.id)} disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: 'var(--color-primary)' }}>
                    {saving ? '...' : 'Save'}
                  </button>
                  <button onClick={() => setEditId(null)}
                    className="px-3 py-1.5 rounded-lg text-xs border"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-3)' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => { setEditId(store.id); setEditVal(store.our_price || '') }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}>
                    Update Price
                  </button>
                  <button onClick={() => navigate(`/stores/${store.id}`)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
                    style={{ background: 'var(--color-accent)' }}>
                    View Detail
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
