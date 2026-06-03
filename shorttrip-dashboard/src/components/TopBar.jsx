import { Sun, Moon, RefreshCw, Fuel } from 'lucide-react'
import { useTheme } from '../App'
import { useState } from 'react'
import { triggerAllStoresCheck } from '../api/priceApi'

export default function TopBar() {
  const { dark, toggleTheme } = useTheme()
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(new Date())

  const handleSync = async () => {
    setSyncing(true)
    try { await triggerAllStoresCheck() } catch {}
    setLastSync(new Date())
    setTimeout(() => setSyncing(false), 2000)
  }

  const timeStr = lastSync.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <header
      className="flex items-center justify-between px-6 py-3 flex-shrink-0"
      style={{
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        height: '56px',
      }}
    >
      {/* Left — Live indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 glow-pulse inline-block" />
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-3)' }}>
            Live — Last sync {timeStr} EST
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
            background: syncing ? 'var(--color-surface-2)' : 'transparent',
            borderColor: 'var(--color-border)',
            color: syncing ? 'var(--color-text-3)' : 'var(--color-accent)',
          }}
        >
          <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Now'}
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
          title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  )
}
