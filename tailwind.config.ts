import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gray: {
          950: '#07091a',
          900: '#0d1128',
          800: '#141831',
          700: '#1c2240',
          600: '#2a3260',
          500: '#3d4f85',
          400: '#7d8cbf',
          300: '#aab3d9',
          200: '#cdd4f0',
          100: '#e8ebf8',
        },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%)',
        'gradient-accent-r': 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
