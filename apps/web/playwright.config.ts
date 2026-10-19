import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:3000", channel: process.env.CI ? undefined : "chrome" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "phone-width", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
  ],
});
