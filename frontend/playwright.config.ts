import { defineConfig, devices } from "@playwright/test";

// E2E config. Uses the system Chrome (channel: "chrome") so no Playwright
// browser download is needed. Two web servers: the deterministic indexer
// fixture and the built app served by `vite preview`. The app must be built
// with VITE_INDEXER_URL pointing at the fixture (see `node e2e/run.mjs`).
const FIXTURE_PORT = Number(process.env.FIXTURE_PORT || 4788);
const PREVIEW_PORT = Number(process.env.PREVIEW_PORT || 4793);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PREVIEW_PORT}`,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: [
    {
      command: `node e2e/fixtures/indexer-fixture.mjs`,
      port: FIXTURE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      command: `pnpm preview --port ${PREVIEW_PORT} --strictPort`,
      port: PREVIEW_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
