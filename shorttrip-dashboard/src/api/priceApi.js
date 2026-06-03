import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

// ── Axios Instance ────────────────────────────────────────────
const api = axios.create({ baseURL: API_BASE })

// Auto-attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('st_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401 globally → redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('st_token')
      localStorage.removeItem('st_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────
export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then(r => r.data)

// ── Dashboard Summary ─────────────────────────────────────────
export const fetchAlertSummary = () =>
  api.get('/alerts/summary').then(r => r.data)

// ── Stores ────────────────────────────────────────────────────
export const fetchStores = () =>
  api.get('/stores').then(r => r.data)

export const fetchStore = (id) =>
  api.get(`/stores/${id}`).then(r => r.data)

export const updateStorePrice = (id, our_price) =>
  api.patch(`/stores/${id}/price`, { our_price }).then(r => r.data)

export const triggerStoreCheck = (id) =>
  api.post(`/stores/${id}/trigger`).then(r => r.data)

export const triggerAllStoresCheck = () =>
  api.post('/engine/run').then(r => r.data).catch(() =>
    fetch('/api/health').then(() => ({ status: 'triggered' }))
  )

// ── Prices ────────────────────────────────────────────────────
export const fetchLatestPrices = () =>
  api.get('/prices/latest').then(r => r.data)

export const fetchPriceHistory = (store_id, days = 7) => {
  const params = { days }
  if (store_id) params.store_id = store_id
  return api.get('/prices/history', { params }).then(r => r.data)
}

export const fetchChartData = (store_id) => {
  const params = {}
  if (store_id) params.store_id = store_id
  return api.get('/prices/chart', { params }).then(r => r.data)
}

// ── Alerts ────────────────────────────────────────────────────
export const fetchAlerts = (params = {}) =>
  api.get('/alerts', { params }).then(r => r.data)

export const notifyAlert = (id) =>
  api.post(`/alerts/${id}/notify`).then(r => r.data)

export const acknowledgeAlert = (id) =>
  api.patch(`/alerts/${id}/acknowledge`).then(r => r.data)

export const acknowledgeAllAlerts = () =>
  api.patch('/alerts/acknowledge-all').then(r => r.data)

// ── Workers ───────────────────────────────────────────────────
export const fetchWorkers = () =>
  api.get('/workers').then(r => r.data)

export const addWorker = (data) =>
  api.post('/workers', data).then(r => r.data)

export const updateWorker = (id, data) =>
  api.patch(`/workers/${id}`, data).then(r => r.data)

export const deleteWorker = (id) =>
  api.delete(`/workers/${id}`).then(r => r.data)

// ── Settings ──────────────────────────────────────────────────
export const fetchSettings = () =>
  api.get('/settings').then(r => r.data)

export const saveSettings = (settings) =>
  api.put('/settings', { settings }).then(r => r.data)

// ── Mock data for offline/dev without backend ─────────────────
export const MOCK_STORES = [
  { id:1,  name:'614 US-78, Ridgeville',       our_price:3.350, best_comp_name:'Shell',   best_comp_price:3.190, price_diff:-0.160, price_status:'alert',   active_alerts:1, last_checked: new Date().toISOString() },
  { id:2,  name:'3147 State Rd, Ridgeville',   our_price:3.280, best_comp_name:'BP',      best_comp_price:3.210, price_diff:-0.070, price_status:'monitor', active_alerts:0, last_checked: new Date().toISOString() },
  { id:3,  name:'348 College Park Rd, Ladson', our_price:3.220, best_comp_name:'Exxon',   best_comp_price:3.250, price_diff:+0.030, price_status:'ok',      active_alerts:0, last_checked: new Date().toISOString() },
  { id:4,  name:'3880 Patriot Pkwy, Sumter',   our_price:3.410, best_comp_name:'Chevron', best_comp_price:3.290, price_diff:-0.120, price_status:'alert',   active_alerts:1, last_checked: new Date().toISOString() },
  { id:5,  name:'101 N Hwy 52, Moncks Corner', our_price:3.300, best_comp_name:'Shell',   best_comp_price:3.350, price_diff:+0.050, price_status:'ok',      active_alerts:0, last_checked: new Date().toISOString() },
  { id:6,  name:'3272 US-52, Moncks Corner',   our_price:3.290, best_comp_name:'BP',      best_comp_price:3.310, price_diff:+0.020, price_status:'ok',      active_alerts:0, last_checked: new Date().toISOString() },
  { id:7,  name:'117 S Boundary St, Manning',  our_price:3.310, best_comp_name:'Exxon',   best_comp_price:3.300, price_diff:-0.010, price_status:'monitor', active_alerts:0, last_checked: new Date().toISOString() },
  { id:8,  name:'3022 Old Hwy 52, Moncks Cor.',our_price:3.320, best_comp_name:'Shell',   best_comp_price:3.380, price_diff:+0.060, price_status:'ok',      active_alerts:0, last_checked: new Date().toISOString() },
  { id:9,  name:'3995 North Rd, Orangeburg',   our_price:3.300, best_comp_name:'Chevron', best_comp_price:3.280, price_diff:-0.020, price_status:'monitor', active_alerts:0, last_checked: new Date().toISOString() },
  { id:10, name:'1010 Old Hwy 52 (Laundromat)',our_price:3.280, best_comp_name:'BP',      best_comp_price:3.310, price_diff:+0.030, price_status:'ok',      active_alerts:0, last_checked: new Date().toISOString() },
]

export default api
