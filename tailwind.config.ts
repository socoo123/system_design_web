import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { base: v("--bg-base"), card: v("--bg-card"), elev: v("--bg-elev") },
        border: { subtle: v("--border-subtle"), strong: v("--border-strong") },
        accent: { DEFAULT: v("--accent"), muted: v("--accent") },
        drac: {
          bg: v("--drac-bg"),
          line: v("--drac-line"),
          fg: v("--drac-fg"),
          comment: v("--drac-comment"),
          cyan: v("--drac-cyan"),
          green: v("--drac-green"),
          orange: v("--drac-orange"),
          pink: v("--drac-pink"),
          purple: v("--drac-purple"),
          red: v("--drac-red"),
          yellow: v("--drac-yellow"),
        },
        night: {
          bg: "#0d0e13",
          card: "#14161d",
          elev: "#23262f",
          line: "#2e3140",
          fg: "#f8f8f2",
          comment: "#7d83a8",
          cyan: "#8be9fd",
          green: "#50fa7b",
          orange: "#ffb86c",
          pink: "#ff4fa3",
          purple: "#bd93f9",
          red: "#ff5555",
          yellow: "#f1fa8c",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
} satisfies Config;
