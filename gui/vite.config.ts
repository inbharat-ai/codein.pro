import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "path";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // Sentry plugin disabled - configure CodeIn Sentry org/project before re-enabling
    // sentryVitePlugin({
    //   org: "codein-org",
    //   project: "codein",
    // }),
  ],
  build: {
    sourcemap: true,

    // Change the output .js filename to not include a hash
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        indexConsole: resolve(__dirname, "indexConsole.html"),
      },
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name].[ext]`,
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-redux": ["@reduxjs/toolkit", "react-redux"],
          "vendor-markdown": [
            "react-markdown",
            "rehype-highlight",
            "rehype-katex",
            "remark-math",
          ],
          "vendor-tiptap": [
            "@tiptap/core",
            "@tiptap/react",
            "@tiptap/starter-kit",
          ],
          "vendor-ui": [
            "@headlessui/react",
            "@heroicons/react",
            "downshift",
            "react-tooltip",
          ],
          "vendor-xterm": ["xterm", "xterm-addon-fit"],
          "vendor-cytoscape": ["cytoscape"],
          "vendor-telemetry": ["posthog-js"],
          "vendor-utils": ["lodash", "dompurify", "uuid", "diff", "anser"],
        },
      },
    },
  },
  server: {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["*", "Content-Type", "Authorization"],
      credentials: true,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["e2e/**", "node_modules/**"],
    setupFiles: "./src/util/test/setupTests.ts",
    onConsoleLog(log, type) {
      if (type === "stderr") {
        if (
          [
            "contentEditable",
            "An update to Chat inside a test was not wrapped in act",
            "An update to TipTapEditor inside a test was not wrapped in act",
            "An update to ThinkingIndicator inside a test was not wrapped in act",
            "The current testing environment is not configured to support act",
            "target.getClientRects is not a function",
            "prosemirror",
          ].some((text) => log.includes(text))
        ) {
          return false;
        }
      }
      return true;
    },
    onUnhandledRejection(err) {
      // Suppress ProseMirror DOM errors in test environment
      if (
        err.message?.includes("getClientRects") ||
        err.message?.includes("prosemirror")
      ) {
        return false;
      }
      return true;
    },
  },
});
