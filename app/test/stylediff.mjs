// Computed-style + bounding-box diff: for a set of matched selectors, compare
// getComputedStyle (key visual props) and getBoundingClientRect (sub-pixel) between
// app and v8, and print the first/biggest differences. Stop guessing — measure.
// Usage: APP_URL=... SELECTORS=".card:first-of-type .name,..." W=1024 THEME=classic node test/stylediff.mjs
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Lenovo/cour/frontend/package.json");
const { chromium } = require("@playwright/test");
const APP = process.env.APP_URL || "http://127.0.0.1:3012";
const DESIGN = "file:///C:/Users/Lenovo/cour/design/cour-v8.html";
const W = Number(process.env.W || 1024), THEME = process.env.THEME || "classic", H = Number(process.env.H || 900);
const SELECTORS = (process.env.SELECTORS ||
  ".hscroll .card:first-of-type .name,.hscroll .card:first-of-type .tick,.hscroll .card:first-of-type .mc,.hscroll .card:first-of-type .chg,.hscroll .card:first-of-type .mc-label,.hscroll .card:first-of-type .addr,.hscroll .card:first-of-type,.hscroll .card:first-of-type .card-top,.row-head h2"
).split(",").map((s) => s.trim());
const PROPS = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textTransform",
  "color", "padding", "margin", "border", "borderRadius", "boxShadow", "outline", "background", "transform",
  "width", "height", "display", "flex", "gap", "alignItems", "justifyContent", "whiteSpace", "fontVariationSettings", "fontFeatureSettings"];
function resolveChrome() {
  const def = chromium.executablePath();
  if (existsSync(def)) return def;
  const base = join(process.env.LOCALAPPDATA, "ms-playwright");
  const b = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, c) => Number(c.split("-")[1]) - Number(a.split("-")[1]))[0];
  return join(base, b, "chrome-win64", "chrome.exe");
}
function setTheme(theme) {
  const B = document.body;
  B.classList.remove("theme-cartoon", "theme-light", "l-pink");
  if (theme !== "classic") B.classList.add("theme-cartoon");
  if (theme === "light") { B.classList.add("theme-light"); B.classList.add("l-pink"); }
  B.dataset.theme = theme;
}
const APP_PATH = process.env.APP_PATH || "/";
const V8_EVAL = process.env.V8_EVAL || ""; // e.g. "window.openToken('AUR')"
async function snap(browser, url, sels, props, theme) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem("cour-risk-ok-v1", "1"); } catch {} try { Math.random = () => 0.5; } catch {} });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: url === DESIGN ? "load" : "networkidle", timeout: 30000 });
  await page.waitForTimeout(url === DESIGN ? 500 : 300);
  if (url === DESIGN && V8_EVAL) { await page.evaluate(V8_EVAL).catch(() => {}); await page.waitForTimeout(300); }
  await page.evaluate(setTheme, theme);
  await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });
  await page.waitForTimeout(200);
  const data = await page.evaluate(({ sels, props }) => {
    const out = {};
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = null; continue; }
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const o = { _text: (el.textContent || "").slice(0, 24), _box: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) } };
      for (const p of props) o[p] = cs[p];
      out[sel] = o;
    }
    return out;
  }, { sels, props });
  await ctx.close();
  return data;
}
(async () => {
  const browser = await chromium.launch({ executablePath: resolveChrome() });
  const a = await snap(browser, APP + APP_PATH, SELECTORS, PROPS, THEME);
  const v = await snap(browser, DESIGN, SELECTORS, PROPS, THEME);
  await browser.close();
  console.log(`# style/bbox diff @ ${W} ${THEME} (app vs v8)\n`);
  for (const sel of SELECTORS) {
    const ao = a[sel], vo = v[sel];
    if (!ao || !vo) { console.log(`SEL ${sel}: ${!ao ? "APP missing" : ""}${!vo ? " V8 missing" : ""}`); continue; }
    const diffs = [];
    if (JSON.stringify(ao._box) !== JSON.stringify(vo._box)) diffs.push(`box app=${JSON.stringify(ao._box)} v8=${JSON.stringify(vo._box)}`);
    if (ao._text !== vo._text) diffs.push(`text app="${ao._text}" v8="${vo._text}"`);
    for (const p of PROPS) if (ao[p] !== vo[p]) diffs.push(`${p}: app="${ao[p]}" v8="${vo[p]}"`);
    if (diffs.length) { console.log(`SEL ${sel}`); diffs.forEach((d) => console.log("   " + d)); console.log(""); }
    else console.log(`SEL ${sel}: identical`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
