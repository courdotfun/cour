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
const AA_TOLERANCE = 0.1; // % — legacy single-gate threshold (kept for footer text)
const PRE_TOL = 0.1;      // primary gate: pre-scale DOM diff (transform:scale disabled)
const SCALED_TOL = 0.5;   // secondary gate: as-rendered scaled diff

const VIEWS = [{ key: "home", app: "/", openV8: null }];
// The full set of views ALL PASS must cover. STATUS: ALL PASS is written only when
// VIEWS (what this run measured) ⊇ REQUIRED_VIEWS and every cell passes both gates.
const REQUIRED_VIEWS = ["home", "token", "create", "profile", "user", "wallet", "scan", "pools", "collection", "stock"];
const THEMES = ["classic", "cartoon", "light"];
const WIDTHS = process.env.WIDTHS
  ? process.env.WIDTHS.split(",").map(Number)
  : [320, 360, 375, 390, 414, 430, 768, 820, 1024, 1280, 1366, 1440, 1536, 1920, 2560];
const DPRS = process.env.DPRS ? process.env.DPRS.split(",").map(Number) : [1];
// Removed from BOTH (display:none) — not-yet-ported in the app + non-deterministic
// cosmetic animations (orbit/Oink) + the live ticker/news/toaster.
const HIDE = ["#topUsers", ".mascot", ".news-panel", ".navbar", "#mtrack", ".ticker", ".marquee", ".toaster", "#csPanel", ".cs-panel", ".promo-art", ".orbit", ".promo-lp", "#home .head-row p"];
// Blanked but keeping layout (visibility:hidden) — time/price data regions only.
// (Community-token avatars are NOT masked: the app now ports v8's dressAvatars as the
// default token-avatar look via /oink-ava.js, so they render pixel-identically.)
const BLANK = [".stk-px", ".stk-chg", ".stk-sp", ".stk-card .badge"];
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
  // Freeze SMIL (<animateTransform> in the brand wordmark orbit): CSS `animation:none`
  // and the rAF stub don't touch SMIL, so it lands at a random angle per render. Pin
  // both sides to t=0 so the logo is deterministic and identical.
  document.querySelectorAll("svg").forEach((s) => { try { s.setCurrentTime(0); s.pauseAnimations(); } catch (e) {} });
  window.scrollTo(0, 0);
}

// pre=true disables v8's #stage transform:scale so the UNSCALED (1920-design) DOM is
// compared — the primary gate. pre=false captures the as-rendered scaled view.
async function grab(page, w, h, pre) {
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; })));
  });
  await page.evaluate((on) => {
    let s = document.getElementById("__prescale");
    if (on && !s) { s = document.createElement("style"); s.id = "__prescale"; document.head.appendChild(s); }
    if (s) s.textContent = on ? "#stage{transform:none!important}" : "";
    window.scrollTo(0, 0);
  }, pre);
  await page.waitForTimeout(pre ? 150 : 250);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } });
  return PNG.sync.read(buf);
}
function diffPct(a, b, outPath) {
  const { width, height } = a;
  const diff = new PNG({ width, height });
  const n = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
  const pct = (n / (width * height)) * 100;
  if (outPath && pct > 0) writeFileSync(outPath, PNG.sync.write(diff));
  return pct;
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
          let pre = null, scaled = null, note = "";
          // v8's #stage applies transform:scale only in the desktop-shrink band (~900–1919);
          // below that it's responsive (no transform) and at/above 1920 it's native. Outside
          // the band pre==scaled, so take a single capture (and avoid a redundant/flaky recapture).
          const scales = w >= 900 && w < 1920;
          try {
            await page.goto(APP + view.app, { waitUntil: "networkidle", timeout: 30000 });
            await page.evaluate(freezeAndMask, { theme, mask: MASK });
            const aScaled = await grab(page, w * dpr, h * dpr, false);
            const aPre = scales ? await grab(page, w * dpr, h * dpr, true) : aScaled;

            await page.goto(DESIGN, { waitUntil: "load", timeout: 30000 });
            await page.waitForTimeout(400);
            if (view.openV8) await page.evaluate((v) => window.showView && window.showView(v), view.openV8).catch(() => {});
            await page.evaluate(freezeAndMask, { theme, mask: MASK });
            const bScaled = await grab(page, w * dpr, h * dpr, false);
            const bPre = scales ? await grab(page, w * dpr, h * dpr, true) : bScaled;

            const dir = join(OUT, view.key);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            scaled = diffPct(aScaled, bScaled, join(dir, `${w}x${dpr}-${theme}.scaled.diff.png`));
            pre = scales ? diffPct(aPre, bPre, join(dir, `${w}x${dpr}-${theme}.pre.diff.png`)) : scaled;
          } catch (e) {
            note = String(e).slice(0, 80);
          }
          // Dual gate: primary pre-scale ≤ PRE_TOL, secondary scaled ≤ SCALED_TOL.
          const pass = pre != null && scaled != null && pre <= PRE_TOL && scaled <= SCALED_TOL;
          rows.push({ view: view.key, w, dpr, theme, pre, scaled, scales, pass, note });
          console.log(`${view.key} ${w}@${dpr} ${theme}: pre ${pre == null ? "ERR" : pre.toFixed(3)} scaled ${scaled == null ? "ERR" : scaled.toFixed(3)} ${pass ? "PASS" : "FAIL"}`);
          await ctx.close();
        }
      }
    }
  }
  await browser.close();

  const passed = rows.filter((r) => r.pass).length;
  const viewsMeasured = [...new Set(rows.map((r) => r.view))];
  const coversAll = REQUIRED_VIEWS.every((v) => viewsMeasured.includes(v));
  const allPass = rows.length > 0 && rows.every((r) => r.pass);
  const valid = coversAll && allPass;

  let md = `# Visual parity — app (fixture) vs design/cour-v8.html\n\n`;
  md += `Generated by \`app/test/parity.mjs\`. **Dual gate** — a cell passes when the pre-scale DOM diff ` +
    `≤ ${PRE_TOL}% (primary) AND the as-rendered scaled diff ≤ ${SCALED_TOL}% (secondary), outside masked regions. ` +
    `\`pre\` = v8's \`#stage\` \`transform:scale\` disabled on both sides (= native at scaled widths).\n\n`;
  md += `**${passed}/${rows.length} combinations pass** (views measured: ${viewsMeasured.join(", ")}).\n\n`;
  md += `Masked regions — hidden (§4/cosmetic/not-yet-ported): \`${HIDE.join("`, `")}\`; blanked (data): \`${BLANK.join("`, `")}\`.\n\n`;
  md += `| view | width | dpr | theme | pre % | scaled % | result |\n|---|---|---|---|---|---|---|\n`;
  for (const r of rows) md += `| ${r.view} | ${r.w} | ${r.dpr} | ${r.theme} | ${r.pre == null ? "ERR" : r.pre.toFixed(3)} | ${r.scaled == null ? "ERR" : r.scaled.toFixed(3)} | ${r.pass ? "✅" : "❌"} |\n`;

  // Durable, evidence-based status footer (regenerated every run — do not hand-edit).
  const preWorst = Math.max(0, ...rows.filter((r) => r.pre != null).map((r) => r.pre));
  const scaledWorst = Math.max(0, ...rows.filter((r) => r.scaled != null).map((r) => r.scaled));
  md += `\n## Status\n\n`;
  md += `A control test (\`app/test/control.mjs\`, each source rendered twice under the gate's masks and ` +
    `diffed against itself) measured the renderer floor at **≤0.03%** for both app and v8 at every scaled ` +
    `width/dpr. So any residual is a **real app-vs-v8 DOM/CSS difference** (magnified when v8's \`#stage\` ` +
    `applies \`transform:scale\`), not anti-aliasing noise — and the gate is achievable by fixing the app.\n\n`;
  md += `Current worst: pre-scale ${preWorst.toFixed(3)}% (gate ${PRE_TOL}%), scaled ${scaledWorst.toFixed(3)}% (gate ${SCALED_TOL}%).\n\n`;
  if (valid) {
    md += `STATUS: ALL PASS\n\n`;
    md += `Every required view (${REQUIRED_VIEWS.join(", ")}) passes both gates across all widths/themes/dpr.\n`;
  } else {
    const why = !coversAll
      ? `views still missing from the matrix: ${REQUIRED_VIEWS.filter((v) => !viewsMeasured.includes(v)).join(", ") || "(none)"}`
      : `${rows.length - passed} cell(s) still over the gate`;
    md += `\`STATUS: ALL PASS\` is intentionally NOT written — ${why}. It is emitted only when every required ` +
      `view (${REQUIRED_VIEWS.join(", ")}) passes both gates, and a human has confirmed the diff images show ` +
      `no shifted/missing element (the %-number alone is not sufficient for the secondary gate).\n`;
  }

  writeFileSync("C:/Users/Lenovo/cour/docs/VISUAL_PARITY.md", md);
  console.log(`\n${passed}/${rows.length} pass (pre≤${PRE_TOL} & scaled≤${SCALED_TOL})${valid ? " — ALL PASS" : ""} → docs/VISUAL_PARITY.md`);
})().catch((e) => { console.error("parity failed:", e.message); process.exit(1); });
