import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import StoreDetail from './pages/StoreDetail'
import History from './pages/History'
import Workers from './pages/Workers'
import Settings from './pages/Settings'
import AllStores from './pages/AllStores'

// ── Auth Context ──────────────────────────────────────────────
export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// ── Theme Context ─────────────────────────────────────────────
export const ThemeContext = createContext(null)
export const useTheme = () => useContext(ThemeContext)

// ── Protected Route ───────────────────────────────────────────
const ProtectedRoute = ({ children }) => {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('st_token') || null)
  const [user, setUser]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('st_user') || 'null') } catch { return null }
  })
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('st_theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // Apply dark class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('st_theme', dark ? 'dark' : 'light')
  }, [dark])

  const login = (newToken, userData) => {
    setToken(newToken)
    setUser(userData)
    localStorage.setItem('st_token', newToken)
    localStorage.setItem('st_user', JSON.stringify(userData))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('st_token')
    localStorage.removeItem('st_user')
  }

  const toggleTheme = () => setDark(d => !d)

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme }}>
      <AuthContext.Provider value={{ token, user, login, logout }}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute><Layout /></ProtectedRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"    element={<Dashboard />} />
              <Route path="stores"       element={<AllStores />} />
              <Route path="stores/:id"   element={<StoreDetail />} />
              <Route path="alerts"       element={<Alerts />} />
              <Route path="history"      element={<History />} />
              <Route path="workers"      element={<Workers />} />
              <Route path="settings"     element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthContext.Provider>
    </ThemeContext.Provider>
  )
}
