export default function MetricCard({ icon: Icon, label, value, sub, color = 'accent', trend }) {
  const colorMap = {
    accent:  { bg: 'rgba(255,107,0,0.10)',  border: 'rgba(255,107,0,0.25)',  text: '#FF6B00' },
    red:     { bg: 'rgba(227,30,36,0.10)',  border: 'rgba(227,30,36,0.25)',  text: '#E31E24' },
    green:   { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.25)',  text: '#22C55E' },
    yellow:  { bg: 'rgba(255,210,0,0.12)',  border: 'rgba(255,210,0,0.30)',  text: '#D4A800' },
    primary: { bg: 'rgba(227,30,36,0.08)',  border: 'rgba(227,30,36,0.20)',  text: '#E31E24' },
  }
  const c = colorMap[color] || colorMap.accent

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 hover:scale-[1.02] cursor-default animate-fade-in"
      style={{
        background: 'var(--color-surface)',
        border: `1px solid var(--color-border)`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: c.bg, border: `1px solid ${c.border}` }}
      >
        <Icon size={20} style={{ color: c.text }} />
      </div>

      {/* Value */}
      <div>
        <div className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
          {value}
        </div>
        <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--color-text-2)' }}>
          {label}
        </div>
        {sub && (
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-3)' }}>
            {sub}
          </div>
        )}
      </div>

      {/* Trend indicator */}
      {trend !== undefined && (
        <div
          className="text-xs font-medium px-2 py-0.5 rounded-full self-start"
          style={{
            background: trend >= 0 ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
            color: trend >= 0 ? '#22C55E' : '#EF4444',
          }}
        >
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}
