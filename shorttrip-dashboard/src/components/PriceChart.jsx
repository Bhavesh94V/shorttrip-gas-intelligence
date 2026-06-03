import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'

const COLORS = [
  '#E31E24', '#FF6B00', '#FFD200', '#22C55E',
  '#3B82F6', '#A855F7', '#EC4899', '#14B8A6', '#F59E0B', '#6366F1'
]

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 shadow-xl border text-xs"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', minWidth: 160 }}>
      <p className="font-semibold mb-2" style={{ color: 'var(--color-text-2)' }}>{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4 mb-1">
          <span style={{ color: entry.color }}>● {entry.name}</span>
          <span className="font-bold" style={{ color: 'var(--color-text)' }}>
            ${parseFloat(entry.value).toFixed(3)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PriceChart({ data = [], height = 260, showLegend = true }) {
  // data: [{ date, store_name, our_price }] grouped by date
  if (!data.length) return (
    <div className="flex items-center justify-center py-12">
      <p className="text-sm" style={{ color: 'var(--color-text-3)' }}>No price history yet</p>
    </div>
  )

  // Flatten: create rows per date with each store as a key
  const storeNames = [...new Set(data.map(d => d.store_name))]
  const dates = [...new Set(data.map(d =>
    new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  ))]
  const chartData = dates.map(date => {
    const row = { date }
    storeNames.forEach(name => {
      const match = data.find(d =>
        new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) === date &&
        d.store_name === name
      )
      if (match) row[name] = parseFloat(match.our_price)
    })
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--color-text-3)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={v => `$${v.toFixed(2)}`}
          tick={{ fontSize: 11, fill: 'var(--color-text-3)' }}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />
        <Tooltip content={<CustomTooltip />} />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: 'var(--color-text-3)', paddingTop: 8 }}
          />
        )}
        {storeNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
