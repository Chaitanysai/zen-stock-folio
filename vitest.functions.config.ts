import { defineConfig } from "vitest/config";

/**
 * Pages Functions tests run in Node, not jsdom: they exercise the same
 * WebCrypto/fetch surfaces the Workers runtime provides.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["functions/**/*.test.ts"],
    globals: true,
    restoreMocks: true,
  },
  esbuild: { target: "es2022" },
});
