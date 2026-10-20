import { defineConfig, devices } from "@playwright/test";

const evidence = process.env.SLABTRAK_TEST_EVIDENCE === "1";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    channel: process.env.CI ? undefined : "chrome",
    screenshot: "on",
    trace: "retain-on-failure",
    video: evidence ? "on" : "off",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "phone-width", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
});
