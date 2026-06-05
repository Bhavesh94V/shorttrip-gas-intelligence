import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.12)' }}>
            <AlertTriangle size={28} style={{ color: '#EF4444' }} />
          </div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
            Something went wrong
          </h2>
          <p className="text-sm max-w-md text-center" style={{ color: 'var(--color-text-3)' }}>
            {this.state.error?.message || 'An unexpected error occurred. Please try refreshing the page.'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'var(--color-primary)' }}
          >
            <RefreshCw size={14} /> Reload Page
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
