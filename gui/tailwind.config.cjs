/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");
const { varWithFallback, THEME_COLORS } = require("./src/styles/theme");

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    // Note that these breakpoints are primarily optimized for the input toolbar
    screens: {
      "2xs": "170px", // Smallest width for Primary Sidebar in VS Code
      xs: "250px", // Avg default sidebar width in VS Code
      sm: "330px",
      int: "380px",
      md: "460px",
      lg: "590px",
      xl: "720px",
      "2xl": "860px",
      "3xl": "1000px",
      "4xl": "1180px",
    },
    extend: {
      animation: {
        "spin-slow": "spin 6s linear infinite",
      },
      borderRadius: {
        default: "0.5rem",
      },
      fontSize: {
        "2xs": "0.6875rem", // 11px
      },
      outlineOffset: {
        0.5: "0.5px",
      },
      colors: {
        background: varWithFallback("background"),
        foreground: varWithFallback("foreground"),
        editor: {
          DEFAULT: varWithFallback("editor-background"),
          foreground: varWithFallback("editor-foreground"),
        },
        primary: {
          DEFAULT: varWithFallback("primary-background"),
          foreground: varWithFallback("primary-foreground"),
          hover: varWithFallback("primary-hover"),
        },
        secondary: {
          DEFAULT: varWithFallback("secondary-background"),
          foreground: varWithFallback("secondary-foreground"),
          hover: varWithFallback("secondary-hover"),
        },
        border: {
          DEFAULT: varWithFallback("border"),
          focus: varWithFallback("border-focus"),
        },
        command: {
          DEFAULT: varWithFallback("command-background"),
          foreground: varWithFallback("command-foreground"),
          border: {
            DEFAULT: varWithFallback("command-border"),
            focus: varWithFallback("command-border-focus"),
          },
        },
        description: {
          DEFAULT: varWithFallback("description"),
          muted: varWithFallback("description-muted"),
        },
        input: {
          DEFAULT: varWithFallback("input-background"),
          foreground: varWithFallback("input-foreground"),
          border: varWithFallback("input-border"),
          placeholder: varWithFallback("input-placeholder"),
        },
        table: {
          oddRow: varWithFallback("table-oddRow"),
        },
        badge: {
          DEFAULT: varWithFallback("badge-background"),
          foreground: varWithFallback("badge-foreground"),
        },
        info: varWithFallback("info"),
        success: varWithFallback("success"),
        warning: varWithFallback("warning"),
        error: varWithFallback("error"),
        link: varWithFallback("link"),
        accent: varWithFallback("accent"),
        terminal: varWithFallback("terminal"),
        findMatch: {
          DEFAULT: THEME_COLORS["find-match"].default,
          selected: varWithFallback("find-match-selected"),
        },
        list: {
          hover: varWithFallback("list-hover"),
          active: {
            DEFAULT: varWithFallback("list-active"),
            foreground: varWithFallback("list-active-foreground"),
          },
        },

        // ── CodeIn Design System ──────────────────────────────────────
        codin: {
          bg: {
            DEFAULT: "var(--codin-bg-primary, #0f0e17)",
            secondary: "var(--codin-bg-secondary, #141320)",
            tertiary: "var(--codin-bg-tertiary, #1a1832)",
            surface: "var(--codin-bg-surface, #201e3a)",
            hover: "var(--codin-bg-hover, #262450)",
            active: "var(--codin-bg-active, #312e81)",
          },
          fg: {
            DEFAULT: "var(--codin-fg-primary, #e8e6f0)",
            secondary: "var(--codin-fg-secondary, #a8a5c0)",
            muted: "var(--codin-fg-muted, #8b88ad)",
          },
          indigo: {
            50: "#eef2ff",
            100: "#e0e7ff",
            200: "#c7d2fe",
            300: "#a5b4fc",
            400: "#818cf8",
            500: "#6366f1",
            600: "#4f46e5",
            700: "#4338ca",
            800: "#3730a3",
            900: "#312e81",
            950: "#1e1b4b",
          },
          saffron: {
            50: "#fffbeb",
            100: "#fef3c7",
            200: "#fde68a",
            300: "#fcd34d",
            400: "#fbbf24",
            500: "#f59e0b",
            600: "#d97706",
            700: "#b45309",
          },
          border: {
            DEFAULT: "var(--codin-border, rgba(99, 102, 241, 0.12))",
            strong: "var(--codin-border-strong, rgba(99, 102, 241, 0.25))",
            focus: "var(--codin-border-focus, rgba(245, 158, 11, 0.5))",
          },
        },

        // Legacy aliases — kept only for any straggling references
        lightgray: "var(--codin-fg-muted, #8b88ad)",
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
