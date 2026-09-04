import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? "http://127.0.0.1:3107";
const browserChannel = (process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? (process.platform === "darwin" ? "chrome" : undefined)) as "chrome" | undefined;

export default defineConfig({
  testDir: "./test",
  testMatch: "tree-command-center.e2e.spec.ts",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off"
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 }, ...(browserChannel ? { channel: browserChannel } : {}) } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], ...(browserChannel ? { channel: browserChannel } : {}) } }
  ],
  webServer: process.env.PLAYWRIGHT_TEST_BASE_URL ? undefined : {
    command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3107",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
