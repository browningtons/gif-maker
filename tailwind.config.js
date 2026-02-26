/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f8ff',
          100: '#e8f0ff',
          300: '#9ab8ff',
          500: '#4f83ff',
          700: '#2149c8',
          900: '#0f1a40'
        }
      }
    }
  },
  plugins: []
};
