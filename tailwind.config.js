/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0D1117",
        panels: "#161B22",
        cards: "#1E1E1E",
        accent: "#3B82F6",
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        border: "#30363D",
        editorBg: "#1E1E1E",
        textMuted: "#8B949E",
        textActive: "#C9D1D9",
      },
      fontFamily: {
        ui: ["Inter", "sans-serif"],
        editor: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
}
