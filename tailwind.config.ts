import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        // Remapped to the Gilifast Figma brand: the consumer pages reference
        // gilifast-deep/ocean/foam for accents, so redefining these values
        // rebrands the whole consumer surface to electric blue + periwinkle.
        gilifast: {
          deep: "#103BE9",
          ocean: "#0052D4",
          foam: "#E1E7FF",
          coral: "#ff9a3c",
          coralDeep: "#e88528",
        },
        brand: {
          DEFAULT: "#103BE9",
          dark: "#00228E",
          cyan: "#00AEEF",
          periwinkle: "#E1E7FF",
          ink: "#1F1F1F",
        },
        mekari: {
          primary: "#1B5FE3",
          "primary-600": "#1247B8",
          "primary-50": "#E8F0FE",
          success: "#16A34A",
          warning: "#F59E0B",
          danger: "#DC2626",
          "neutral-900": "#0F172A",
          "neutral-700": "#334155",
          "neutral-500": "#64748B",
          "neutral-200": "#E2E8F0",
          "neutral-50": "#F8FAFC",
          surface: "#FFFFFF",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        pill: "44px",
      },
      boxShadow: {
        ambient: "0 0 25px rgba(0,0,0,0.15)",
        "ambient-sm": "0 0 15px rgba(0,0,0,0.06)",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
