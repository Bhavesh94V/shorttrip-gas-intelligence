import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { login as apiLogin } from '../api/priceApi'
import { Fuel, Eye, EyeOff, AlertCircle } from 'lucide-react'
import logo from '../assets/logo.webp'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('manager@shorttrip.com')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await apiLogin(email, password)
      login(data.token, { email: data.email, role: data.role })
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Dev shortcut — login with mock token
  const devLogin = () => {
    login('dev_mock_token_2026', { email: 'manager@shorttrip.com', role: 'manager' })
    navigate('/dashboard')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #E31E24, transparent)' }} />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #FF6B00, transparent)' }} />
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl p-8 relative z-10 animate-fade-in"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-brand)',
        }}
      >
        {/* Logo + Title */}
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="Short Trip" className="w-16 h-16 object-contain mb-4" />
          <h1 className="text-xl font-bold text-center" style={{ color: 'var(--color-text)' }}>
            Price Intelligence
          </h1>
          <p className="text-sm text-center mt-1" style={{ color: 'var(--color-text-3)' }}>
            Short Trip Gas Stations — Manager Portal
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-2)' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input"
              placeholder="manager@shorttrip.com"
              required
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-2)' }}>
              Password
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input pr-10"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--color-text-3)' }}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
              style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 active:scale-95 mt-1"
            style={{ background: loading ? 'var(--color-accent)' : 'var(--color-primary)' }}
          >
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>

        {/* Dev Login */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={devLogin}
            className="w-full py-2 rounded-lg text-xs font-medium transition-all"
            style={{ color: 'var(--color-text-3)', background: 'var(--color-surface-2)' }}
          >
            🛠 Dev Mode — Skip Login
          </button>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: 'var(--color-text-3)' }}>
          GarudX.AI © 2026
        </p>
      </div>
    </div>
  )
}
