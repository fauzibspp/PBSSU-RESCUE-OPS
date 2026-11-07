import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/api/test/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 90000,
    hookTimeout: 30000,
  },
});
