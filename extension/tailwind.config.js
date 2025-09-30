/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/**/*.html"
  ],
  theme: {
    extend: {
      colors: {
        github: {
          bg: '#ffffff',
          'bg-secondary': '#f6f8fa',
          border: '#d1d9e0',
          text: '#1f2328',
          'text-secondary': '#656d76',
          blue: '#0969da',
          'blue-hover': '#0550ae',
          green: '#1a7f37',
          red: '#d1242f',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['SFMono-Regular', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Consolas', 'monospace']
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      }
    },
  },
  plugins: [],
  // Ensure we don't interfere with GitHub's styles
  corePlugins: {
    preflight: false,
  }
}