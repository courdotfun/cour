// Control test (decision A): is the scaled-width mismatch renderer noise or real DOM diff?
// Render EACH source twice in independent contexts and diff it against itself.
//  - app-vs-app ≈ 0 and v8-vs-v8 ≈ 0  → renderer is deterministic; any app-vs-v8
//    residual at scaled widths is a REAL DOM/CSS difference magnified by scaling → fix the app.
//  - control itself ~0.2%             → the floor is renderer AA noise at fractional scale → gate B.
// Usage: APP_URL=http://127.0.0.1:3012 node test/control.mjs
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
const require = createRequire("C:/Users/Lenovo/cour/frontend/package.json");
const { chromium } = require("@playwright/test");

const APP = process.env.APP_URL || "http://127.0.0.1:3012";
const DESIGN = "file:///C:/Users/Lenovo/cour/design/cour-v8.html";
const WIDTHS = (process.env.WIDTHS ? process.env.WIDTHS.split(",") : ["320", "390", "768", "1366", "1440"]).map(Number);
const DPRS = (process.env.DPRS ? process.env.DPRS.split(",") : ["1", "2"]).map(Number);
const H = 900;

function resolveChrome() {
  const def = chromium.executablePath();
  if (existsSync(def)) return def;
  const base = join(process.env.LOCALAPPDATA, "ms-playwright");
  const b = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, c) => Number(c.split("-")[1]) - Number(a.split("-")[1]))[0];
  return join(base, b, "chrome-win64", "chrome.exe");
}
// Same HIDE set as the gate — so the control measures the SAME surface (dynamic
// chrome like orbit/ticker/mascot is hidden, not counted as v8 self-noise).
const HIDE = ["#topUsers", ".mascot", ".news-panel", ".navbar", "#mtrack", ".ticker", ".marquee", ".toaster", "#csPanel", ".cs-panel", ".promo-art", ".orbit", ".promo-lp", "#home .head-row p"];
function freeze(hide) {
  const css = document.createElement("style");
  css.textContent = "*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}" +
    hide.map((s) => `${s}{display:none!important}`).join("");
  document.head.appendChild(css);
  document.querySelectorAll("svg").forEach((s) => { try { s.setCurrentTime(0); s.pauseAnimations(); } catch (e) {} });
  window.scrollTo(0, 0);
}
async function grab(browser, url, w, dpr) {
  const ctx = await browser.newContext({ viewport: { width: w, height: H }, deviceScaleFactor: dpr });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("cour-risk-ok-v1", "1"); } catch {}
    try { Math.random = () => 0.5; } catch {}
    try { window.requestAnimationFrame = () => 0; } catch {}
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: url === DESIGN ? "load" : "networkidle", timeout: 30000 });
  await page.waitForTimeout(url === DESIGN ? 400 : 0);
  await page.evaluate(freeze, HIDE);
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
  });
  await page.waitForTimeout(250);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w * dpr, height: H * dpr } });
  await ctx.close();
  return PNG.sync.read(buf);
}
function diffPct(a, b) {
  const { width, height } = a;
  const d = new PNG({ width, height });
  const n = pixelmatch(a.data, b.data, d.data, width, height, { threshold: 0.1 });
  return (n / (width * height)) * 100;
}
(async () => {
  const browser = await chromium.launch({ executablePath: resolveChrome() });
  const rows = [];
  for (const dpr of DPRS) {
    for (const w of WIDTHS) {
      const a1 = await grab(browser, APP + "/", w, dpr);
      const a2 = await grab(browser, APP + "/", w, dpr);
      const appApp = diffPct(a1, a2);
      const v1 = await grab(browser, DESIGN, w, dpr);
      const v2 = await grab(browser, DESIGN, w, dpr);
      const v8v8 = diffPct(v1, v2);
      rows.push({ w, dpr, appApp, v8v8 });
      console.log(`${w}@${dpr}  app-vs-app ${appApp.toFixed(3)}%   v8-vs-v8 ${v8v8.toFixed(3)}%`);
    }
  }
  await browser.close();
  let md = `\n## Control test (A) — renderer determinism at scaled widths\n\n`;
  md += `Each source rendered twice in independent contexts and diffed against itself. `;
  md += `Near-zero ⇒ renderer is deterministic, so any app-vs-v8 residual is a real DOM/CSS diff (fixable to ≤0.1%). `;
  md += `~0.2%+ ⇒ the floor is sub-pixel AA noise from fractional \`transform:scale\` (methodology gate needed).\n\n`;
  md += `| width | dpr | app-vs-app % | v8-vs-v8 % |\n|---|---|---|---|\n`;
  for (const r of rows) md += `| ${r.w} | ${r.dpr} | ${r.appApp.toFixed(3)} | ${r.v8v8.toFixed(3)} |\n`;
  const worst = Math.max(...rows.map((r) => Math.max(r.appApp, r.v8v8)));
  md += `\nWorst control cell: **${worst.toFixed(3)}%**. ` +
    (worst < 0.1
      ? `Renderer is deterministic → scaled residual is real DOM/CSS → drive the app to ≤0.1% at scaled widths too.\n`
      : `Control itself exceeds 0.1% → the floor is renderer AA noise → the dual gate (pre-scale ≤0.1% + scaled ≤0.5%) is the correct measure.\n`);
  writeFileSync("C:/Users/Lenovo/cour/docs/_control.partial.md", md);
  console.log("\nworst control:", worst.toFixed(3) + "%", "→ docs/_control.partial.md");
})().catch((e) => { console.error(e); process.exit(1); });
