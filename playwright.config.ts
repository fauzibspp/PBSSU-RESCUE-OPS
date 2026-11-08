import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PBSSU_WEB_PORT ?? 5173);

export default defineConfig({
  testDir: "./tests/browser",
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
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
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
    command: `npm run dev:web -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
