import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import {
  LayoutDashboard, MapPin, Bell, History,
  Users, Settings, LogOut, Fuel, ChevronRight, Map
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { fetchAlertSummary } from '../api/priceApi'
import logo from '../assets/logo.webp'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/stores',    icon: MapPin,           label: 'All Stores' },
  { to: '/map',       icon: Map,              label: 'Store Map' },
  { to: '/alerts',    icon: Bell,             label: 'Alerts',    badge: true },
  { to: '/history',   icon: History,          label: 'Price History' },
  { to: '/workers',   icon: Users,            label: 'Workers' },
  { to: '/settings',  icon: Settings,         label: 'Settings' },
]

export default function Sidebar() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [alertCount, setAlertCount] = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    fetchAlertSummary()
      .then(d => setAlertCount(d.active_alerts || 0))
      .catch(() => setAlertCount(3)) // mock fallback
    const interval = setInterval(() => {
      fetchAlertSummary()
        .then(d => setAlertCount(d.active_alerts || 0))
        .catch(() => {})
    }, 120000) // refresh every 2 min
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <aside
      className="flex flex-col transition-all duration-300 relative"
      style={{
        width: collapsed ? '68px' : '220px',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        flexShrink: 0,
      }}
    >
      {/* Logo + Brand */}
      <div className="flex items-center gap-3 p-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <img src={logo} alt="Short Trip" className="w-9 h-9 object-contain flex-shrink-0" />
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-bold text-sm leading-tight" style={{ color: 'var(--color-primary)' }}>
              Short Trip
            </div>
            <div className="text-xs" style={{ color: 'var(--color-text-3)' }}>
              Price Intelligence
            </div>
          </div>
        )}
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute -right-3 top-14 w-6 h-6 rounded-full flex items-center justify-center z-10 border"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-3)',
        }}
      >
        <ChevronRight size={12} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
      </button>

      {/* Navigation */}
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`
            }
            title={collapsed ? label : ''}
          >
            <div className="relative flex-shrink-0">
              <Icon size={18} />
              {badge && alertCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </div>
            {!collapsed && <span>{label}</span>}
            {!collapsed && badge && alertCount > 0 && (
              <span
                className="ml-auto text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                style={{ background: 'var(--color-primary)' }}
              >
                {alertCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="p-3" style={{ borderTop: '1px solid var(--color-border)' }}>
        {!collapsed && (
          <div className="flex items-center gap-2 mb-2 px-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--color-accent)' }}
            >
              M
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                Manager
              </div>
              <div className="text-[10px] truncate" style={{ color: 'var(--color-text-3)' }}>
                {user?.email || 'manager@shorttrip.com'}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`sidebar-item w-full ${collapsed ? 'justify-center' : ''}`}
          style={{ color: 'var(--color-danger)' }}
          title={collapsed ? 'Logout' : ''}
        >
          <LogOut size={16} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
