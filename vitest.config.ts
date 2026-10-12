import { defineConfig } from "vitest/config";
import path from "node:path";

const stub = (name: string) => path.resolve(__dirname, "test/stubs", name);

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    environment: "node",
    testTimeout: 20000,
    pool: "forks",
  },
  resolve: {
    alias: {
      "next/server": stub("next-server.ts"),
      "next/cache": stub("next-cache.ts"),
      "posthog-js": stub("posthog-js.ts"),
    },
  },
  esbuild: { jsx: "automatic" },
});
