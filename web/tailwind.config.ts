import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Azeret Mono"'],
        mono: ['"Azeret Mono"'],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
        full: '9999px',
      },
      colors: {
        // App accent palette
        accent: {
          mist: "#dee3e2",     // soft gray-green
          blush: "#fccbcb",    // soft pink
          sky: "#78b3d6",      // calm blue
          coral: "#d86969",    // warm red
          ember: "#a34545",    // dark muted red (configured but offline)
          forest: "#4f7969",   // deep green
        },
      },
      animation: {
        "bounce-once": "bounce-once 0.3s ease-out",
        "scale-up": "scale-up 0.4s ease-out forwards",
        "fade-in": "fade-in 0.3s ease-out forwards",
        "float-up": "float-up 2s ease-out forwards",
        "spin-slow": "spin-slow 3s linear infinite",
        "spin-slow-reverse": "spin-slow-reverse 3s linear infinite",
        "reel-spin": "reel-spin 0.1s linear infinite",
        "light-chase": "light-chase 0.5s ease-in-out infinite alternate",
        "skeleton-shimmer": "skeleton-shimmer 4s ease-in-out infinite",
        "skeleton-progress": "skeleton-progress 2s ease-in-out infinite",
      },
      keyframes: {
        "bounce-once": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "scale-up": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "50%": { transform: "scale(1.05)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "float-up": {
          "0%": { transform: "translateY(100%) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(-400%) rotate(360deg)", opacity: "0" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "spin-slow-reverse": {
          from: { transform: "rotate(360deg)" },
          to: { transform: "rotate(0deg)" },
        },
        "reel-spin": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(-100%)" },
        },
        "light-chase": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "1" },
        },
        "skeleton-shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "skeleton-progress": {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(200%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
