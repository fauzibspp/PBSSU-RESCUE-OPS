import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PBSSU_WEB_PORT ?? 5173);

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/browser/global-setup.ts",
  globalTeardown: "./tests/browser/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "off",
    screenshot: "off",
    video:
      process.env.PBSSU_CAPTURE_VIDEO === "1" ? "retain-on-failure" : "off",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "desktop-edge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
    {
      name: "mobile-edge",
      use: { ...devices["Pixel 7"], channel: "msedge" },
    },
  ],
  webServer: {
    command: `npm run dev --workspace @pbssu/web -- --port ${port}`,
    env: {
      ...process.env,
      PBSSU_API_PORT: String(Number(process.env.PBSSU_API_PORT ?? 3301)),
      PBSSU_WEB_PORT: String(port),
    },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
