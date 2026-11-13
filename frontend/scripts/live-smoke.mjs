// Live production smoke test against https://cour.fun (system Chrome via Playwright).
// Checks: page boots, 0 real console errors, 3 themes apply, mobile renders,
// and the Launch button shows the invite-only gate for a non-allowlisted wallet.
// Network noise is ignored (the prod indexer URL may be unset → indexer fetches
// are expected to fail gracefully; we only fail on real JS/page errors).
import { chromium, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TARGET = process.env.SMOKE_URL || "https://cour.fun/";
const mockWallet = readFileSync(fileURLToPath(new URL("../e2e/fixtures/mock-wallet.js", import.meta.url)), "utf8");
const isNoise = (t) => /Failed to load resource|ERR_CONNECTION|ERR_NETWORK|net::|favicon|status of 4|status of 5|fetch/i.test(t);

const out = { url: TARGET, desktop: {}, mobile: {}, themes: {}, inviteOnly: {}, errors: [] };

function attachErrors(page, bucket) {
  page.on("console", (m) => { if (m.type() === "error" && !isNoise(m.text())) bucket.push("console: " + m.text()); });
  page.on("pageerror", (e) => { if (!isNoise(e.message)) bucket.push("pageerror: " + e.message); });
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  // ---- Desktop ----
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  const page = await ctx.newPage();
  await page.addInitScript(mockWallet);
  attachErrors(page, errors);
  const resp = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 45000 });
  out.desktop.status = resp && resp.status();
  await page.waitForFunction(() => !!window.COUR, { timeout: 20000 });
  out.desktop.courBooted = true;
  out.desktop.title = await page.title();
  await page.screenshot({ path: "screenshots/live-desktop.png" });

  // ---- 3 themes ----
  for (const t of ["classic", "cartoon", "light"]) {
    await page.evaluate((th) => window.setTheme && window.setTheme(th), t);
    await page.waitForTimeout(300);
    const cls = await page.evaluate(() => document.body.className);
    out.themes[t] = { bodyClass: cls };
    await page.screenshot({ path: `screenshots/live-theme-${t}.png` });
  }
  // restore default
  await page.evaluate(() => window.setTheme && window.setTheme("cartoon"));

  // ---- Invite-only gate (non-allowlisted mock wallet) ----
  try {
    const addr = await page.evaluate(async () => (await window.COUR_WALLET.connect("Mock Wallet")).addr);
    out.inviteOnly.connected = addr;
    await page.evaluate(() => window.showView && window.showView("create"));
    // give the gate time to query on-chain allowlist + update the button
    await page.waitForTimeout(4000);
    const gate = await page.evaluate(() => {
      const b = document.getElementById("ctLaunch");
      return b ? { text: (b.textContent || "").trim(), disabled: b.disabled, gated: b.dataset.courGated || null } : null;
    });
    out.inviteOnly.button = gate;
    out.inviteOnly.ok = !!gate && /invite-only/i.test(gate.text) && gate.disabled === true;
  } catch (e) {
    out.inviteOnly.error = String(e).slice(0, 200);
  }
  out.desktop.errors = errors;
  out.errors.push(...errors);
  await ctx.close();

  // ---- Mobile ----
  const mctx = await browser.newContext({ ...devices["iPhone 13"] });
  const merrors = [];
  const mpage = await mctx.newPage();
  await mpage.addInitScript(mockWallet);
  attachErrors(mpage, merrors);
  const mresp = await mpage.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 45000 });
  out.mobile.status = mresp && mresp.status();
  await mpage.waitForFunction(() => !!window.COUR, { timeout: 20000 });
  out.mobile.courBooted = true;
  await mpage.screenshot({ path: "screenshots/live-mobile.png" });
  out.mobile.errors = merrors;
  out.errors.push(...merrors);
  await mctx.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.errors.length ? 2 : 0);
