/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        'apple': '0 4px 24px rgba(0, 0, 0, 0.06)',
        'apple-sm': '0 2px 8px rgba(0, 0, 0, 0.04)',
        'apple-lg': '0 8px 32px rgba(0, 0, 0, 0.08)',
      },
      colors: {
        'apple-gray': '#F5F5F7',
        'apple-dark': '#1D1D1F',
        'apple-blue': '#0066CC',
      },
      borderRadius: {
        'apple': '18px',
        'apple-sm': '12px',
      }
    },
  },
  plugins: [],
};
