import type { Config } from "tailwindcss";
import { COLOR } from "./src/design/tokens";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        /* shadcn: leen las variables de src/index.css (valores HIVE). */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },

        /* HIVE — tokens por función (src/design/tokens.ts). */
        canvas: COLOR.canvas,
        surface: COLOR.surface,
        sunken: COLOR.sunken,
        line: { DEFAULT: COLOR.line, strong: COLOR.lineStrong },
        ink: { DEFAULT: COLOR.ink, muted: COLOR.inkMuted },
        accent: {
          DEFAULT: COLOR.accent,
          soft: COLOR.accentSoft,
          strong: COLOR.accentStrong,
          foreground: COLOR.onAccent,
        },
        success: COLOR.success,
        danger: COLOR.danger,
        inverse: {
          DEFAULT: COLOR.inverse,
          raised: COLOR.inverseRaised,
          foreground: COLOR.onInverse,
          muted: COLOR.onInverseMuted,
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        display: ['"Unbounded"', "system-ui", "sans-serif"],
        /* Alias legacy hasta la Tarea 12 (la Tarea 5 migra sus usos). */
        alilato: ['"Manrope"', "system-ui", "sans-serif"],
        gulfs: ['"Unbounded"', "system-ui", "sans-serif"],
        bebas: ['"Unbounded"', "system-ui", "sans-serif"],
        syne: ['"Manrope"', "system-ui", "sans-serif"],
        dm: ['"Manrope"', "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
