import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

// "Graphite & brass" — a warm paper substrate under cool graphite ink, with brass
// reserved for one job only: money. See the plan for the full rationale.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        substrate: "#F2F0EC",
        card: "#FBFAF8",
        ink: {
          DEFAULT: "#14161A",
          soft: "#4A4E56",
          mute: "#7C818B",
          faint: "#A9ADB5",
        },
        // Money, and only money. Also the color of a SIM's contact pads.
        brass: {
          DEFAULT: "#C89B3C",
          deep: "#A87F28",
          wash: "#F5EEDD",
        },
        signal: {
          DEFAULT: "#00C566",
          deep: "#00A855",
          wash: "#E2F7EC",
        },
        alert: {
          DEFAULT: "#FF3B30",
          deep: "#DE2A20",
          wash: "#FFE9E7",
        },
        hairline: {
          DEFAULT: "#DCD8D1",
          strong: "#C7C2B9",
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
        DEFAULT: "#F2F0EC",
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
      },
      animation: {
        "rise-in": "rise-in 380ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "cell-punch": "cell-punch 180ms ease-out",
        "led-pulse": "led-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
