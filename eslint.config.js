import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "test/v1-snapshot/**", "test/types/v1-declared/**", "test/types/compat.generated.ts", "fixtures/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly", document: "readonly", navigator: "readonly", location: "readonly", history: "readonly",
        localStorage: "readonly", sessionStorage: "readonly", console: "readonly", process: "readonly", globalThis: "readonly",
        fetch: "readonly", Response: "readonly", Request: "readonly", Headers: "readonly", URL: "readonly", URLSearchParams: "readonly",
        AbortController: "readonly", Blob: "readonly", FormData: "readonly", XMLHttpRequest: "readonly", setTimeout: "readonly",
        clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", Buffer: "readonly", btoa: "readonly",
        Image: "readonly", Storage: "readonly", __dirname: "readonly", File: "readonly", HTMLElement: "readonly",
      },
    },
    rules: {
      // Runtime parity with v1 means many intentionally loose shapes.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description", "ts-expect-error": "allow-with-description" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // The CLI is v1's code, ported as JavaScript.
    files: ["src/cli/**/*.js", "scripts/**/*.mjs"],
    rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }] },
  }
);
