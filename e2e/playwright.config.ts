import { defineConfig, devices } from "@playwright/test";
import { CLIENT_PORT, CLIENT_URL, SERVER_URL, serverEnv } from "./test-env";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  // All tests share one database, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: CLIENT_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Fresh servers on their own ports on every run, so the database reset below always happens.
  // webServer starts before globalSetup, which is why the reset is part of the server command.
  webServer: [
    {
      name: "server",
      command: "bun ../e2e/scripts/reset-test-db.ts && bun src/index.ts",
      cwd: "../server",
      env: serverEnv,
      url: `${SERVER_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      name: "client",
      command: `bunx --bun vite --port ${CLIENT_PORT} --strictPort`,
      cwd: "../client",
      env: { API_PROXY_TARGET: SERVER_URL },
      url: CLIENT_URL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
