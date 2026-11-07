import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/api/test/**/*.test.ts"],
    exclude: ["**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
  },
});
