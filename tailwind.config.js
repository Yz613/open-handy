/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./hud.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mac: {
          bg: '#1c1c1e',
          card: '#2c2c2e',
          cardHover: '#3a3a3c',
          border: '#38383a',
          accent: '#0a84ff',
          accentHover: '#0071e3',
          success: '#30d158',
          danger: '#ff453a',
          warning: '#ffd60a',
          textSecondary: '#8e8e93',
        }
      },
      animation: {
        'pulse-subtle': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        }
      }
    },
  },
  plugins: [],
}
