/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { forest: '#234237', cream: '#faf9f4', rose: '#b67b73', ink: '#273c33' },
      fontFamily: { serif: ['Georgia', 'serif'], sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
