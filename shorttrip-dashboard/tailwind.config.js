/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── Short Trip Brand Colors (from logo) ──
        brand: {
          red:       '#E31E24',
          'red-dark':'#B91519',
          orange:    '#FF6B00',
          'orange-light': '#FF8C00',
          yellow:    '#FFD200',
          'yellow-light': '#FFE14D',
        },
        // ── Light Theme (logo-inspired warm whites) ──
        light: {
          bg:        '#FFF9F5',
          surface:   '#FFFFFF',
          border:    '#FFE0CC',
          'border-2':'#FFDDC4',
          text:      '#1A1A1A',
          'text-2':  '#5A4A40',
          'text-3':  '#8A7A70',
        },
        // ── Dark Theme (deep dark + red accent) ──
        dark: {
          bg:        '#0D0D0D',
          surface:   '#161616',
          card:      '#1E1E1E',
          border:    '#2A2A2A',
          'border-2':'#333333',
          text:      '#F5F0EE',
          'text-2':  '#B0A8A4',
          'text-3':  '#6A6260',
        },
      },
      animation: {
        'fade-in':       'fadeIn 0.3s ease-out',
        'slide-in':      'slideIn 0.3s ease-out',
        'pulse-slow':    'pulse 3s ease-in-out infinite',
        'bounce-subtle': 'bounceSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-4px)' },
        },
      },
      boxShadow: {
        'brand-sm':  '0 2px 8px rgba(227, 30, 36, 0.15)',
        'brand-md':  '0 4px 16px rgba(227, 30, 36, 0.2)',
        'brand-lg':  '0 8px 32px rgba(227, 30, 36, 0.25)',
        'orange-sm': '0 2px 8px rgba(255, 107, 0, 0.15)',
        'card-dark': '0 4px 24px rgba(0,0,0,0.4)',
        'card-light':'0 4px 24px rgba(255, 107, 0, 0.08)',
      },
      backgroundImage: {
        'brand-gradient':  'linear-gradient(135deg, #E31E24 0%, #FF6B00 60%, #FFD200 100%)',
        'brand-gradient-h':'linear-gradient(90deg, #E31E24 0%, #FF6B00 100%)',
        'dark-gradient':   'linear-gradient(135deg, #1E1E1E 0%, #161616 100%)',
        'card-glow-dark':  'linear-gradient(135deg, rgba(227,30,36,0.08) 0%, rgba(255,107,0,0.04) 100%)',
        'card-glow-light': 'linear-gradient(135deg, rgba(255,107,0,0.06) 0%, rgba(255,210,0,0.04) 100%)',
      },
    },
  },
  plugins: [],
}
