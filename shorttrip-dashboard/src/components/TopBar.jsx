import { Sun, Moon, RefreshCw, Menu } from 'lucide-react'
import { useTheme } from '../App'
import { useState } from 'react'
import { triggerAllStoresCheck } from '../api/priceApi'

export default function TopBar({ onMenuClick }) {
  const { dark, toggleTheme } = useTheme()
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(new Date())
  const [syncDone, setSyncDone] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    setSyncDone(false)
    try { await triggerAllStoresCheck() } catch {}
    setLastSync(new Date())
    setSyncing(false)
    setSyncDone(true)
    setTimeout(() => setSyncDone(false), 3000)
  }

  const timeStr = lastSync.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

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
      {/* Left — Hamburger (mobile) + Live indicator */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuClick}
          className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center border"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text-2)',
          }}
          aria-label="Open menu"
        >
          <Menu size={16} />
        </button>

        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{
              background: syncDone ? '#22C55E' : '#22C55E',
              boxShadow: '0 0 0 0 rgba(34,197,94,0.4)',
              animation: 'glow-pulse 2s ease-in-out infinite',
            }}
          />
          <span className="text-xs font-medium hidden sm:inline" style={{ color: 'var(--color-text-3)' }}>
            {syncDone ? '✓ Synced!' : `Live · Last sync ${timeStr}`}
          </span>
        </div>
      </div>

      {/* Right — Actions */}
      <div className="flex items-center gap-2">
        {/* Manual Sync */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={{
            background: syncDone ? 'rgba(34,197,94,0.1)' : syncing ? 'var(--color-surface-2)' : 'transparent',
            borderColor: syncDone ? '#22C55E' : 'var(--color-border)',
            color: syncDone ? '#22C55E' : syncing ? 'var(--color-text-3)' : 'var(--color-accent)',
          }}
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">
            {syncing ? 'Syncing...' : syncDone ? 'Synced!' : 'Sync Now'}
          </span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 rounded-lg flex items-center justify-center border transition-all"
          style={{
            background: 'var(--color-surface-2)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-2)',
          }}
          title={dark ? 'Light Mode' : 'Dark Mode'}
          aria-label={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  )
}
