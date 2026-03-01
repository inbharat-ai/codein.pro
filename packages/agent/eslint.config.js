const js = require("@eslint/js");

module.exports = [
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        global: "readonly",
        require: "readonly",
        module: "writable",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        fetch: "readonly",
        URL: "readonly",
        AbortController: "readonly",
      },
    },
    rules: {
      // ── Core quality rules (aligned with extensions/cli) ──
      "prefer-const": "warn",
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-duplicate-imports": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "warn",

      // ── Complexity limits ──
      complexity: ["warn", { max: 35 }],
      "max-depth": ["warn", { max: 5 }],
      "max-nested-callbacks": ["warn", { max: 4 }],
      "max-params": ["warn", { max: 6 }],
      "max-lines": [
        "warn",
        { max: 600, skipBlankLines: true, skipComments: true },
      ],

      // ── Best practices ──
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-wrappers": "error",
      "no-throw-literal": "error",
      "no-useless-catch": "warn",
      "no-useless-return": "warn",
      "prefer-promise-reject-errors": "warn",
      curly: ["warn", "multi-line"],
    },
  },
  {
    // Relax rules for test files
    files: ["test/**/*.js", "test/**/*.cjs", "**/*.test.js", "**/*.test.cjs"],
    rules: {
      complexity: "off",
      "max-lines": "off",
      "max-depth": "off",
      "max-params": "off",
      "no-unused-vars": "off",
    },
  },
];
