/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Tahoma"', '"MS Sans Serif"', '"Microsoft Sans Serif"', 'Arial', 'sans-serif'],
        mono: ['"Courier New"', 'Fixedsys', 'Consolas', 'monospace'],
      },
      colors: {
        win: {
          bg: 'var(--win-bg)',
          surface: 'var(--win-surface)',
          highlight: 'var(--win-highlight)',
          shadow: 'var(--win-shadow-dark)',
          darker: 'var(--win-shadow-darker)',
          navy: 'var(--win-titlebar-start)',
          blue: 'var(--win-titlebar-end)',
          teal: 'var(--win-teal)',
          inactive: 'var(--win-titlebar-inactive)',
          canvas: 'var(--win-canvas)',
          ink: 'var(--win-ink)',
          muted: 'var(--win-ink-muted)',
        },
        logic: {
          high: 'var(--logic-1)',
          'high-wire': 'var(--logic-1-wire)',
          'high-bg': 'var(--logic-1-bg)',
          'high-border': 'var(--logic-1-border)',
          low: 'var(--logic-0)',
          'low-bg': 'var(--logic-0-bg)',
          z: 'var(--logic-z)',
          'z-bg': 'var(--logic-z-bg)',
          x: 'var(--logic-x)',
          'x-bg': 'var(--logic-x-bg)',
        },
      },
    },
  },
  plugins: [
    function ({ addVariant }) {
      addVariant('coarse', '@media (pointer: coarse)');
    },
  ],
};
