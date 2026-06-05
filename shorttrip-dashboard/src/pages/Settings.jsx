import { useState, useEffect } from 'react'
import { Save, CheckCircle, Settings as SettingsIcon, Bell, Shield, Database, Clock, Lock } from 'lucide-react'
import { fetchSettings, saveSettings } from '../api/priceApi'
import api from '../api/priceApi'

const DEFAULTS = {
  CHECK_FREQUENCY_HOURS: '2',
  ALERT_THRESHOLD: '0.05',
  SEARCH_RADIUS_MILES: '3.0',
  QUIET_HOURS_START: '22',
  QUIET_HOURS_END: '6',
  DEDUP_HOURS: '4',
  WHATSAPP_ENABLED: 'false',
  TWILIO_ENABLED: 'false',
  EMAIL_ENABLED: 'true',
  MANAGER_EMAIL: '',
  SMTP_USER: '',
}

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    fetchSettings()
      .then(d => setSettings(s => ({ ...s, ...d.settings })))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveSettings(settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { alert('Failed to save settings') }
    finally { setSaving(false) }
  }

  const Section = ({ icon: Icon, title, children }) => (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center gap-2 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(255,107,0,0.12)' }}>
          <Icon size={15} style={{ color: 'var(--color-accent)' }} />
        </div>
        <h2 className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )

  const Field = ({ label, sub, children }) => (
    <div className="flex items-start justify-between gap-4 flex-wrap py-1">
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-3)' }}>{sub}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )

  const Toggle = ({ k }) => (
    <button
      onClick={() => set(k, settings[k] === 'true' ? 'false' : 'true')}
      className="relative w-11 h-6 rounded-full transition-colors"
      style={{ background: settings[k] === 'true' ? 'var(--color-accent)' : 'var(--color-border)' }}
    >
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[k] === 'true' ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )

  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Settings</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-3)' }}>Configure price check intervals and notification channels</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
          style={{ background: saved ? '#22C55E' : 'var(--color-primary)' }}>
          {saved ? <CheckCircle size={14} /> : <Save size={14} />}
          {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Price Check */}
      <Section icon={Clock} title="Price Check Schedule">
        <Field label="Check Frequency" sub="How often to compare prices (hours)">
          <select value={settings.CHECK_FREQUENCY_HOURS} onChange={e => set('CHECK_FREQUENCY_HOURS', e.target.value)}
            className="input text-sm" style={{ width: 120 }}>
            {['1','2','3','4','6','12'].map(v => <option key={v} value={v}>Every {v}h</option>)}
          </select>
        </Field>
        <Field label="Alert Threshold" sub="Price difference to trigger alert (dollars)">
          <select value={settings.ALERT_THRESHOLD} onChange={e => set('ALERT_THRESHOLD', e.target.value)}
            className="input text-sm" style={{ width: 120 }}>
            {['0.03','0.05','0.07','0.10'].map(v => <option key={v} value={v}>${v}</option>)}
          </select>
        </Field>
        <Field label="Search Radius" sub="Competitor search area (miles)">
          <select value={settings.SEARCH_RADIUS_MILES} onChange={e => set('SEARCH_RADIUS_MILES', e.target.value)}
            className="input text-sm" style={{ width: 120 }}>
            {['0.5','1.0','1.5','2.0','3.0','5.0'].map(v => <option key={v} value={v}>{v} miles</option>)}
          </select>
        </Field>
        <Field label="Quiet Hours" sub="No notifications sent during these hours">
          <div className="flex items-center gap-2">
            <select value={settings.QUIET_HOURS_START} onChange={e => set('QUIET_HOURS_START', e.target.value)}
              className="input text-sm" style={{ width: 90 }}>
              {Array.from({length:24},(_,i)=><option key={i} value={i}>{i}:00</option>)}
            </select>
            <span style={{ color: 'var(--color-text-3)' }}>to</span>
            <select value={settings.QUIET_HOURS_END} onChange={e => set('QUIET_HOURS_END', e.target.value)}
              className="input text-sm" style={{ width: 90 }}>
              {Array.from({length:24},(_,i)=><option key={i} value={i}>{i}:00</option>)}
            </select>
          </div>
        </Field>
      </Section>

      {/* Notifications */}
      <Section icon={Bell} title="Notification Channels">
        <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(255,107,0,0.06)', border: '1px solid rgba(255,107,0,0.15)' }}>
          <p style={{ color: 'var(--color-text-2)' }}>
            🟢 <strong>Dashboard alerts</strong> are always active (FREE). Enable channels below when credentials are ready.
          </p>
        </div>
        <Field label="WhatsApp Business API" sub="Requires Meta WhatsApp Business API token (~$30-50/mo)">
          <Toggle k="WHATSAPP_ENABLED" />
        </Field>
        <Field label="Twilio SMS" sub="Requires Twilio SID + Auth Token (~$0.01/SMS)">
          <Toggle k="TWILIO_ENABLED" />
        </Field>
        <Field label="Daily Email Summary" sub="Requires Gmail SMTP credentials (FREE)">
          <Toggle k="EMAIL_ENABLED" />
        </Field>
        {settings.EMAIL_ENABLED === 'true' && (
          <Field label="Manager Email" sub="Receives daily summary every 8 AM EST">
            <input value={settings.MANAGER_EMAIL} onChange={e => set('MANAGER_EMAIL', e.target.value)}
              className="input text-sm" placeholder="manager@shorttrip.com" style={{ width: 240 }} />
          </Field>
        )}
      </Section>

      {/* Change Password */}
      <Section icon={Lock} title="Change Password">
        <Field label="Current Password" sub="Enter your current login password">
          <input
            type="password"
            value={settings._currentPw || ''}
            onChange={e => set('_currentPw', e.target.value)}
            className="input text-sm"
            placeholder="Current password"
            autoComplete="current-password"
            style={{ width: 240 }}
          />
        </Field>
        <Field label="New Password" sub="At least 8 characters">
          <input
            type="password"
            value={settings._newPw || ''}
            onChange={e => set('_newPw', e.target.value)}
            className="input text-sm"
            placeholder="New password"
            autoComplete="new-password"
            style={{ width: 240 }}
          />
        </Field>
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={async () => {
              if (!settings._currentPw || !settings._newPw) return
              if (settings._newPw.length < 8) { alert('Password must be at least 8 characters'); return }
              try {
                await api.post('/auth/change-password', {
                  current_password: settings._currentPw,
                  new_password: settings._newPw
                })
                set('_currentPw', '')
                set('_newPw', '')
                alert('✅ Password changed successfully!')
              } catch (err) {
                alert(err.response?.data?.error || 'Failed to change password')
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'var(--color-primary)' }}
          >
            Update Password
          </button>
          {settings._currentPw && settings._newPw && settings._newPw.length < 8 && (
            <span className="text-xs" style={{ color: '#EF4444' }}>Minimum 8 characters</span>
          )}
        </div>
      </Section>

      {/* System Info */}
      <Section icon={Database} title="System Info">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Price Data Source', value: 'GasBuddy + EIA.gov (FREE)' },
            { label: 'Competitor Finder', value: 'OpenStreetMap (FREE)' },
            { label: 'Database', value: 'PostgreSQL (Supabase Free)' },
            { label: 'Scheduler', value: 'node-cron (FREE)' },
            { label: 'Backend', value: 'FastAPI + Express.js' },
            { label: 'Version', value: 'v1.0.0 — GarudX.AI 2026' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg p-3" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--color-text-3)' }}>{label}</p>
              <p className="font-medium mt-0.5" style={{ color: 'var(--color-text)' }}>{value}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
