import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

// "Graphite & brass" — dynamic theme variables supporting both Light and Dark mode.
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        substrate: "rgb(var(--substrate) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          soft: "rgb(var(--ink-soft) / <alpha-value>)",
          mute: "rgb(var(--ink-mute) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        // Money, and only money. Also the color of a SIM's contact pads.
        brass: {
          DEFAULT: "rgb(var(--brass) / <alpha-value>)",
          deep: "rgb(var(--brass-deep) / <alpha-value>)",
          wash: "rgb(var(--brass-wash) / <alpha-value>)",
        },
        signal: {
          DEFAULT: "rgb(var(--signal) / <alpha-value>)",
          deep: "rgb(var(--signal-deep) / <alpha-value>)",
          wash: "rgb(var(--signal-wash) / <alpha-value>)",
        },
        alert: {
          DEFAULT: "rgb(var(--alert) / <alpha-value>)",
          deep: "rgb(var(--alert-deep) / <alpha-value>)",
          wash: "rgb(var(--alert-wash) / <alpha-value>)",
        },
        hairline: {
          DEFAULT: "rgb(var(--hairline) / <alpha-value>)",
          strong: "rgb(var(--hairline-strong) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-mono)", ...defaultTheme.fontFamily.mono],
      },
      fontSize: {
        eyebrow: ["11px", { lineHeight: "1.2", letterSpacing: "0.12em" }],
        hero: ["44px", { lineHeight: "1", letterSpacing: "-0.03em" }],
        title: ["28px", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        otp: ["32px", { lineHeight: "1" }],
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
        xl: "10px",
      },
      ringOffsetColor: {
        DEFAULT: "rgb(var(--substrate) / <alpha-value>)",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(20, 22, 26, 0.04)",
        lift: "0 2px 10px rgba(20, 22, 26, 0.08)",
        dialog: "0 16px 48px rgba(20, 22, 26, 0.18)",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "cell-punch": {
          "0%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)" },
        },
        "led-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "rise-in": "rise-in 380ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "cell-punch": "cell-punch 180ms ease-out",
        "led-pulse": "led-pulse 2.4s ease-in-out infinite",
        shimmer: "shimmer 2s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
