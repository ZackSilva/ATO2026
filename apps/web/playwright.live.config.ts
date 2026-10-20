import { defineConfig } from "@playwright/test";

// Explicit opt-in: this suite spends a real provider request and stays outside CI fixtures.
if (process.env.SLABTRAK_TEST_LIVE_MARKET !== "1") throw new Error("Enable SLABTRAK_TEST_LIVE_MARKET=1 for the live provider check.");
export default defineConfig({
  testDir: "./live", workers: 1, retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", channel: "chrome", viewport: { width: 1440, height: 1000 }, screenshot: "on", trace: "retain-on-failure", video: "on" },
});
