// Ad-hoc raw capture (no mask) of app + v8 at W/THEME for visual diffing.
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Lenovo/cour/frontend/package.json");
const { chromium } = require("@playwright/test");
const APP = process.env.APP_URL || "http://127.0.0.1:3012";
const DESIGN = "file:///C:/Users/Lenovo/cour/design/cour-v8.html";
const OUT = "C:/Users/Lenovo/cour/docs/visual-diff/raw";
const W = Number(process.env.W || 390), THEME = process.env.THEME || "classic", H = Number(process.env.H || 900);
function resolveChrome() {
  const def = chromium.executablePath();
  if (existsSync(def)) return def;
  const base = join(process.env.LOCALAPPDATA, "ms-playwright");
  const b = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, c) => Number(c.split("-")[1]) - Number(a.split("-")[1]))[0];
  return join(base, b, "chrome-win64", "chrome.exe");
}
function freeze({ theme }) {
  const B = document.body;
  B.classList.remove("theme-cartoon", "theme-light", "l-pink");
  if (theme !== "classic") B.classList.add("theme-cartoon");
  if (theme === "light") { B.classList.add("theme-light"); B.classList.add("l-pink"); }
  B.dataset.theme = theme;
  const css = document.createElement("style");
  css.textContent = "*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";
  document.head.appendChild(css);
  window.scrollTo(0, 0);
}
(async () => {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: resolveChrome() });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem("cour-risk-ok-v1", "1"); } catch {} try { Math.random = () => 0.5; } catch {} try { window.requestAnimationFrame = () => 0; } catch {} });
  const page = await ctx.newPage();
  await page.goto(APP + "/", { waitUntil: "networkidle", timeout: 30000 });
  await page.evaluate(freeze, { theme: THEME });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `app-${W}-${THEME}.png`), clip: { x: 0, y: 0, width: W, height: H } });
  await page.goto(DESIGN, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(500);
  await page.evaluate(freeze, { theme: THEME });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, `v8-${W}-${THEME}.png`), clip: { x: 0, y: 0, width: W, height: H } });
  await browser.close();
  console.log(`wrote app-${W}-${THEME}.png and v8-${W}-${THEME}.png`);
})().catch((e) => { console.error(e); process.exit(1); });
