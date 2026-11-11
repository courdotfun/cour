import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Deterministic UI E2E: proves the design renders 100% REAL data (from the
// indexer fixture + on-chain layer), the demo arrays are gone, the token chart
// shows real candles, forms exist, and the wallet connect flow works via the
// injected EIP-6963 mock. No console errors allowed.
//
// The full on-chain trade/launch/graduation/claim/buyback flow is exercised by
// the env-gated fork spec (fork.spec.ts) — it needs a funded anvil fork of 4663.

const mockWallet = readFileSync(fileURLToPath(new URL("./fixtures/mock-wallet.js", import.meta.url)), "utf8");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(mockWallet);
  const errors: string[] = [];
  // Ignore network-resource noise: the UI E2E runs with NO RPC (dead port) so
  // the on-chain fallbacks are expected to fail — the app handles that
  // gracefully. We only fail on real JS/page errors.
  const isNetworkNoise = (t: string) =>
    /Failed to load resource|ERR_CONNECTION_REFUSED|ERR_NETWORK|net::/i.test(t);
  page.on("console", (m) => {
    if (m.type() === "error" && !isNetworkNoise(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => {
    if (!isNetworkNoise(e.message)) errors.push(e.message);
  });
  (page as any)._courErrors = errors;
});

test("home renders REAL tokens from the indexer (demo data removed)", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).COUR);
  // Live loader replaces the (now empty) demo array with fixture tokens.
  await page.waitForFunction(
    () => {
      const g = (window as any).COUR_getTokens?.() || [];
      return g.length >= 2 && g.some((t: any) => t.tick === "CSMOKE");
    },
    { timeout: 15000 },
  );
  const sections = page.locator("#sections");
  await expect(sections).toContainText("CSMOKE");
  await expect(sections).toContainText("GRAD1");
  // The demo tickers must NOT be present anywhere.
  await expect(sections).not.toContainText("NOVA");
  await expect(sections).not.toContainText("PixelForge");
  expect((page as any)._courErrors).toEqual([]);
});

test("token page shows real price + real candle chart", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => (window as any).COUR_getTokens?.()?.length >= 2, { timeout: 15000 });
  await page.evaluate(() => (window as any).openToken("CSMOKE"));
  await expect(page.locator("#token")).toHaveClass(/active/);
  await expect(page.locator("#tkName")).toHaveText("COUR Smoke");
  // Real price seeded from the fixture lastPriceUsd (0.00024).
  await expect(page.locator("#tkPrice")).not.toHaveText("$0");
  // Real candles seeded into the chart host.
  await page.waitForFunction(() => {
    const el = document.getElementById("tkChart");
    return !!el && el.querySelector("svg") != null;
  }, { timeout: 10000 });
  expect((page as any)._courErrors).toEqual([]);
});

test("create view renders and the launch form is present", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).COUR);
  await page.evaluate(() => (window as any).showView("create"));
  await expect(page.locator("#create")).toHaveClass(/active/);
  // The launch button lives on a later wizard step (hidden until you advance),
  // so assert it exists in the DOM rather than visible.
  await expect(page.locator("#ctLaunch")).toBeAttached();
  await expect(page.locator("#ctName")).toBeAttached();
  expect((page as any)._courErrors).toEqual([]);
});

test("wallet connect via injected EIP-6963 mock works", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).COUR);
  // Drive the real adapter directly (the design's connect modal calls the same).
  const addr = await page.evaluate(async () => {
    const r = await (window as any).COUR_WALLET.connect("Mock Wallet");
    return r.addr;
  });
  expect(addr.toLowerCase()).toBe("0x1eb25d02fc7c5487d4648a602c355dbc2301030b");
  const connected = await page.evaluate(() => (window as any).COUR.wallet.get().address);
  expect(connected?.toLowerCase()).toBe("0x1eb25d02fc7c5487d4648a602c355dbc2301030b");
});

test("portfolio data layer returns real positions from the indexer", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).COUR);
  const pf = await page.evaluate(async () => {
    const r = await (window as any).COUR.data.indexer.portfolio("0x1eb25d02fc7C5487D4648a602c355dBC2301030b");
    return r;
  });
  expect(pf.ok).toBeTruthy();
  expect(pf.data.positions.length).toBeGreaterThan(0);
  expect(pf.data.positions[0].symbol).toBe("CSMOKE");
});
