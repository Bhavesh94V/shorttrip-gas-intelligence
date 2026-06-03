/**
 * AlertBadge — Color-coded status pill
 * status: 'alert' | 'monitor' | 'ok' | 'skip'
 * priority: 'HIGH' | 'MED' | 'LOW'
 */
export default function AlertBadge({ status, priority, size = 'sm' }) {
  const cfg = {
    alert:   { label: priority === 'HIGH' ? '🔴 HIGH ALERT' : '🟠 ALERT', cls: 'badge-alert' },
    monitor: { label: '🟡 CLOSE',      cls: 'badge-monitor' },
    ok:      { label: '✓ OK',          cls: 'badge-ok' },
    skip:    { label: '— NO DATA',     cls: 'badge-skip' },
  }
  const { label, cls } = cfg[status] || cfg.skip

  return (
    <span className={`badge ${cls}`} style={{ fontSize: size === 'xs' ? '10px' : '11px' }}>
      {label}
    </span>
  )
}
