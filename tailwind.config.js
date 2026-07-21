/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        stone: {
          100: 'var(--ink)',
          200: 'var(--ink)',
          300: 'var(--ink-2)',
          400: 'var(--ink-soft)',
          500: 'var(--ink-mute)',
          600: 'var(--paper-edge)',
          700: 'var(--paper-3)',
          750: 'var(--paper-3)',
          800: 'var(--paper-2)',
          900: 'var(--paper)',
        },
        red: { 400: 'var(--danger-text, #f87171)' },
        amber: { 200: 'var(--warning-hover, #fde68a)', 300: 'var(--warning-text, #fcd34d)' },
        parchment: {
          50: 'var(--paper)',
          100: 'var(--paper)',
          200: 'var(--ink)',
          300: 'var(--accent-2)',
          400: 'var(--accent-2)',
          500: 'var(--accent)',
        },
      },
      fontFamily: {
        display: ['"IM Fell English"', 'Georgia', 'serif'],
        body: ['"IM Fell English"', 'Georgia', 'serif'],
        mono: ['"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
