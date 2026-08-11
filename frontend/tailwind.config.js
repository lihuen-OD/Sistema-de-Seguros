/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Verde de marca — reemplaza a blue-*. 600 es el valor exacto pedido
        // (#2C5530); el resto de la rampa se interpola en el mismo hue para
        // que los estados hover/focus/badges queden coherentes.
        brand: {
          50: '#F4FBF5',
          100: '#E6F4E7',
          200: '#C8E5CA',
          300: '#9FCBA3',
          400: '#6DAB72',
          500: '#3D6B41',
          600: '#2C5530',
          700: '#1F4122',
          800: '#163118',
          900: '#0D210F',
        },
      },
      keyframes: {
        // Flip de moneda en KpiCard — la opacidad cae a 0 justo en el punto
        // medio (rotateX 90deg), momento en el que se cambia el contenido
        // (ver KpiCard), así se evita el artefacto de ver el texto "espejado"
        // propio de rotar un elemento sin dos caras reales.
        'flip-value': {
          '0%': { transform: 'rotateX(0deg)', opacity: '1' },
          '50%': { transform: 'rotateX(90deg)', opacity: '0' },
          '100%': { transform: 'rotateX(0deg)', opacity: '1' },
        },
      },
      animation: {
        'flip-value': 'flip-value 400ms ease-in-out',
      },
    },
  },
  plugins: [],
}
