import { Sun, Moon, RefreshCw, Menu, Zap, ZapOff } from 'lucide-react'
import { useTheme } from '../App'
import { useState, useEffect } from 'react'
import { triggerAllStoresCheck, fetchEngineStatus } from '../api/priceApi'

export default function TopBar({ onMenuClick }) {
  const { dark, toggleTheme } = useTheme()
  const [syncing, setSyncing]       = useState(false)
  const [syncDone, setSyncDone]     = useState(false)
  const [syncError, setSyncError]   = useState(false)
  const [lastSync, setLastSync]     = useState(new Date())
  const [engineStatus, setEngineStatus] = useState(null) // null | 'online' | 'offline'

  // Check Python Engine status on mount + every 5 min
  useEffect(() => {
    const checkEngine = async () => {
      const data = await fetchEngineStatus()
      setEngineStatus(data?.python_engine === 'online' ? 'online' : 'offline')
    }
    checkEngine()
    const interval = setInterval(checkEngine, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setSyncDone(false)
    setSyncError(false)
    try {
      await triggerAllStoresCheck()
      setLastSync(new Date())
      setSyncDone(true)
      setEngineStatus('online')
      setTimeout(() => setSyncDone(false), 4000)
    } catch (err) {
      setSyncError(true)
      setEngineStatus('offline')
      setTimeout(() => setSyncError(false), 4000)
    } finally {
      setSyncing(false)
    }
  }

  const timeStr = lastSync.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  // Sync button style
  const syncStyle = syncError
    ? { borderColor: '#EF4444', color: '#EF4444', background: 'rgba(239,68,68,0.08)' }
    : syncDone
    ? { borderColor: '#22C55E', color: '#22C55E', background: 'rgba(34,197,94,0.08)' }
    : { borderColor: 'var(--color-border)', color: 'var(--color-accent)', background: 'transparent' }

  return (
    <header
      className="flex items-center justify-between px-4 md:px-6 py-3 flex-shrink-0"
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        height: '56px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left — Hamburger (mobile) + Live indicator + Engine Status */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuClick}
          className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center border"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text-2)' }}
          aria-label="Open menu"
        >
          <Menu size={16} />
        </button>

        {/* Live dot */}
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{
              background: syncError ? '#EF4444' : '#22C55E',
              animation: 'glow-pulse 2s ease-in-out infinite',
            }}
          />
          <span className="text-xs font-medium hidden sm:inline" style={{ color: 'var(--color-text-3)' }}>
            {syncError ? 'Sync failed' : syncDone ? '✓ Synced!' : `Live · ${timeStr}`}
          </span>
        </div>

        {/* Python Engine Status badge */}
        {engineStatus && (
          <div
            className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{
              background: engineStatus === 'online' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${engineStatus === 'online' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: engineStatus === 'online' ? '#22C55E' : '#EF4444',
            }}
            title={engineStatus === 'online' ? 'Python Engine is running' : 'Python Engine is offline — prices cannot update'}
          >
            {engineStatus === 'online'
              ? <><Zap size={9} /> Engine Online</>
              : <><ZapOff size={9} /> Engine Offline</>
            }
          </div>
        )}
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-2">
        {/* Sync Now */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={syncing ? { borderColor: 'var(--color-border)', color: 'var(--color-text-3)', background: 'var(--color-surface-2)' } : syncStyle}
          title={engineStatus === 'offline' ? 'Python Engine is offline — deploy it on Render first' : 'Trigger price check for all stores'}
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">
            {syncing ? 'Syncing...' : syncError ? 'Engine Offline!' : syncDone ? 'Done!' : 'Sync Now'}
          </span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-2)' }}
          title={dark ? 'Light Mode' : 'Dark Mode'}
          aria-label={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  )
}
