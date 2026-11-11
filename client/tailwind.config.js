/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      fontSize: {
        base: ['15px', '1.55'],
        table: ['14px', '1.45'],
      },
      colors: {
        // "Onyx & Champagne"
        paper: '#F6F4F0', // warm stone page background
        card: '#FFFFFF',
        ink: {
          DEFAULT: '#15171C', // onyx text
          soft: '#555B66',
          faint: '#8D929C',
        },
        line: '#E6E2DA',
        onyx: {
          900: '#0E1013',
          800: '#16191E',
          700: '#20242B',
          600: '#2C313A',
          500: '#3A404B',
        },
        gold: {
          // champagne gold accent
          50: '#FBF8F1',
          100: '#F4ECDA',
          200: '#E8D8B4',
          300: '#D7BE88',
          400: '#C4A465',
          500: '#B08B4F',
          600: '#957340',
          700: '#775B33',
          800: '#5A4427',
        },
        success: { 50: '#ECF6F1', 100: '#D3EBDF', 600: '#1F7A55', 700: '#17603F' },
        danger: { 50: '#FBEEEE', 100: '#F3D4D4', 600: '#B4433F', 700: '#8F302D' },
        warn: { 50: '#FDF6E7', 100: '#F6E5BC', 700: '#7C5A12' },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(21,23,28,0.04), 0 2px 8px rgba(21,23,28,0.05)',
        lift: '0 8px 24px rgba(21,23,28,0.10)',
      },
    },
  },
  plugins: [],
};
