import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "/tmp/kapsbench-playwright-results",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3101",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      KAPSBENCH_USE_DEV_STORE: "1",
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3101",
    },
  },
});
