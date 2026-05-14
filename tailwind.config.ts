import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: "#C9980A",
          light: "#E8B84B",
          dark: "#A07A00",
          pale: "#FDF6E3",
          mid: "#F5E9B8",
        },
        sidebar: {
          bg: "#1A1410",
          hover: "rgba(201,152,10,0.12)",
          active: "rgba(201,152,10,0.18)",
        },
        ink: {
          DEFAULT: "#1C1C1E",
          mid: "#48484A",
          dim: "#8E8E93",
        },
        line: "#E5E0D8",
        ok: { DEFAULT: "#1D7A3A", bg: "#E8F5EC" },
        err: { DEFAULT: "#C0392B", bg: "#FDECEA" },
        warn: "#A07A00",
        info: "#1A5FAB",
        canvas: "#F0EDE8",
        card: "#FFFFFF",
      },
      borderRadius: {
        xl2: "14px",
        lg2: "9px",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(0,0,0,0.08)",
        card: "0 2px 8px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
