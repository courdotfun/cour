// Visual parity matrix: app (fixture mode) vs design/cour-v8.html.
// For each view × theme × viewport: freeze animations, wait fonts/images, mask the
// §4-exception + not-yet-ported regions on BOTH sides, screenshot, pixelmatch.
// Writes diff PNGs + docs/VISUAL_PARITY.md + an HTML report.
//
// Usage: APP_URL=http://127.0.0.1:3012 node test/parity.mjs
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
const require = createRequire("C:/Users/Lenovo/cour/frontend/package.json");
const { chromium } = require("@playwright/test");

const APP = process.env.APP_URL || "http://127.0.0.1:3012";
const DESIGN = "file:///C:/Users/Lenovo/cour/design/cour-v8.html";
const OUT = "C:/Users/Lenovo/cour/docs/visual-diff/parity";
const AA_TOLERANCE = 0.1; // % — threshold for pass

const VIEWS = [{ key: "home", app: "/", openV8: null }];
const THEMES = ["classic", "cartoon", "light"];
const WIDTHS = process.env.WIDTHS
  ? process.env.WIDTHS.split(",").map(Number)
  : [320, 360, 375, 390, 414, 430, 768, 820, 1024, 1280, 1366, 1440, 1536, 1920, 2560];
const DPRS = process.env.DPRS ? process.env.DPRS.split(",").map(Number) : [1];
// Removed from BOTH (display:none) — not-yet-ported in the app + non-deterministic
// cosmetic animations (orbit/Oink) + the live ticker/news/toaster.
const HIDE = ["#topUsers", ".mascot", ".news-panel", ".navbar", "#mtrack", ".ticker", ".marquee", ".toaster", "#csPanel", ".cs-panel", ".promo-art", ".orbit"];
// Blanked but keeping layout (visibility:hidden) — §4 text + time/price data regions.
const BLANK = [".promo-lp", ".stk-px", ".stk-chg", ".stk-sp", ".stk-card .badge", "#home .head-row p"];
const MASK = { HIDE, BLANK };

function resolveChrome() {
  const def = chromium.executablePath();
  if (existsSync(def)) return def;
  const base = join(process.env.LOCALAPPDATA, "ms-playwright");
  const b = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, c) => Number(c.split("-")[1]) - Number(a.split("-")[1]))[0];
  return join(base, b, "chrome-win64", "chrome.exe");
}

function freezeAndMask({ theme, mask }) {
  const B = document.body;
  B.classList.remove("theme-cartoon", "theme-light", "l-pink");
  if (theme !== "classic") B.classList.add("theme-cartoon");
  if (theme === "light") { B.classList.add("theme-light"); B.classList.add("l-pink"); }
  B.dataset.theme = theme;
  const css = document.createElement("style");
  css.textContent =
    "*{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}" +
    mask.HIDE.map((s) => `${s}{display:none!important}`).join("") +
    mask.BLANK.map((s) => `${s}{visibility:hidden!important}`).join("");
  document.head.appendChild(css);
  window.scrollTo(0, 0);
}

async function grab(page, w, h) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
  });
  await page.waitForTimeout(250);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  return PNG.sync.read(buf);
}

(async () => {
  const browser = await chromium.launch({ executablePath: resolveChrome() });
  const rows = [];
  for (const view of VIEWS) {
    for (const dpr of DPRS) {
      for (const w of WIDTHS) {
        const h = 900;
        for (const theme of THEMES) {
          const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
          // determinism: dismiss v8's risk gate + freeze randomness/rAF on both sides
          await ctx.addInitScript(() => {
            try { localStorage.setItem("cour-risk-ok-v1", "1"); } catch {}
            try { Math.random = () => 0.5; } catch {}
            try { window.requestAnimationFrame = () => 0; } catch {}
          });
          const page = await ctx.newPage();
          let mismatch = null, note = "";
          try {
            await page.goto(APP + view.app, { waitUntil: "networkidle", timeout: 30000 });
            await page.evaluate(freezeAndMask, { theme, mask: MASK });
            const a = await grab(page, w * dpr, h * dpr);

            await page.goto(DESIGN, { waitUntil: "load", timeout: 30000 });
            await page.waitForTimeout(400);
            if (view.openV8) await page.evaluate((v) => window.showView && window.showView(v), view.openV8).catch(() => {});
            await page.evaluate(freezeAndMask, { theme, mask: MASK });
            const b = await grab(page, w * dpr, h * dpr);

            const { width, height } = a;
            const diff = new PNG({ width, height });
            const n = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
            mismatch = (n / (width * height)) * 100;
            const dir = join(OUT, view.key);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            if (mismatch > AA_TOLERANCE) writeFileSync(join(dir, `${w}x${dpr}-${theme}.diff.png`), PNG.sync.write(diff));
          } catch (e) {
            note = String(e).slice(0, 80);
          }
          const pass = mismatch != null && mismatch <= AA_TOLERANCE;
          rows.push({ view: view.key, w, dpr, theme, mismatch, pass, note });
          console.log(`${view.key} ${w}@${dpr} ${theme}: ${mismatch == null ? "ERR " + note : mismatch.toFixed(3) + "%"} ${pass ? "PASS" : "FAIL"}`);
          await ctx.close();
        }
      }
    }
  }
  await browser.close();

  const passed = rows.filter((r) => r.pass).length;
  let md = `# Visual parity — app (fixture) vs design/cour-v8.html\n\n`;
  md += `Generated by \`app/test/parity.mjs\`. Pass = mismatch ≤ ${AA_TOLERANCE}% (anti-aliasing tolerance), outside masked regions.\n\n`;
  md += `**${passed}/${rows.length} combinations pass.**\n\n`;
  md += `Masked regions — hidden (§4/cosmetic/not-yet-ported): \`${HIDE.join("`, `")}\`; blanked (data): \`${BLANK.join("`, `")}\`.\n\n`;
  md += `| view | width | dpr | theme | mismatch % | result |\n|---|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${r.view} | ${r.w} | ${r.dpr} | ${r.theme} | ${r.mismatch == null ? "ERR" : r.mismatch.toFixed(3)} | ${r.pass ? "✅" : "❌"} |\n`;
  writeFileSync("C:/Users/Lenovo/cour/docs/VISUAL_PARITY.md", md);
  console.log(`\n${passed}/${rows.length} pass → docs/VISUAL_PARITY.md`);
})().catch((e) => { console.error("parity failed:", e.message); process.exit(1); });
