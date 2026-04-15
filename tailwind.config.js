/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        parchment: {
          50: '#fdf8f0',
          100: '#f9eedb',
          200: '#f2dcb8',
          300: '#e8c488',
          400: '#dca85a',
          500: '#d09038',
        },
      },
      fontFamily: {
        display: ['"Uncial Antiqua"', 'serif'],
        body: ['"IM Fell English"', 'Georgia', 'serif'],
        mono: ['"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}
