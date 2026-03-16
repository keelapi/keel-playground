import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#061019",
        canvas: "#09131e",
        panel: "#0e1b29",
        line: "#223447",
        accent: "#4dd0ff",
        accentSoft: "rgba(77, 208, 255, 0.12)",
        success: "#7bf1a8",
        warning: "#ffd46b",
        danger: "#ff7d7d",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(0, 0, 0, 0.32)",
      },
      fontFamily: {
        sans: ["SF Pro Display", "IBM Plex Sans", "Segoe UI", "sans-serif"],
        mono: ["SFMono-Regular", "IBM Plex Mono", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
