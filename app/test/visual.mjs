// Visual snapshots: the ported app vs design/cour-v8.html, for the ported views
// at 3 themes × 2 viewports. Saves PNGs under docs/visual-diff/ for side-by-side
// review. (Differences are expected only in §4 changes + real-vs-demo data.)
//
// Usage: APP_URL=http://127.0.0.1:3010 TOKEN=0x.. node test/visual.mjs
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire("C:/Users/Lenovo/cour/frontend/package.json");
const { chromium } = require("@playwright/test");

const APP = process.env.APP_URL || "http://127.0.0.1:3010";
const TOKEN = process.env.TOKEN || "";
const DESIGN = "file:///" + "C:/Users/Lenovo/cour/design/cour-v8.html".replace(/\\/g, "/");
const OUT = "C:/Users/Lenovo/cour/docs/visual-diff";

function resolveChrome() {
  const def = chromium.executablePath();
  if (existsSync(def)) return def;
  const base = join(process.env.LOCALAPPDATA, "ms-playwright");
  const b = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, c) => Number(c.split("-")[1]) - Number(a.split("-")[1]))[0];
  return join(base, b, "chrome-win64", "chrome.exe");
}

const THEMES = ["classic", "cartoon", "light"];
const VIEWPORTS = [{ w: 1440, h: 900, k: "desktop" }, { w: 390, h: 844, k: "mobile" }];

function applyTheme(t) {
  const B = document.body;
  B.classList.remove("theme-cartoon", "theme-light", "l-pink");
  if (t !== "classic") B.classList.add("theme-cartoon");
  if (t === "light") { B.classList.add("theme-light"); B.classList.add("l-pink"); }
  B.dataset.theme = t;
}

async function shoot(page, dir, label) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const t of THEMES) {
    await page.evaluate(applyTheme, t);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(dir, `${label}-${t}.png`), fullPage: false });
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: resolveChrome() });
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    page.on("console", () => {});

    // ----- new app -----
    await page.goto(APP + "/", { waitUntil: "networkidle" }).catch(() => {});
    await shoot(page, join(OUT, "app", vp.k), "home");
    if (TOKEN) {
      await page.goto(`${APP}/token/${TOKEN}`, { waitUntil: "networkidle" }).catch(() => {});
      await shoot(page, join(OUT, "app", vp.k), "token");
    }
    await page.goto(APP + "/create", { waitUntil: "networkidle" }).catch(() => {});
    await shoot(page, join(OUT, "app", vp.k), "create");

    // ----- v8 design (demo data) -----
    await page.goto(DESIGN, { waitUntil: "load" }).catch(() => {});
    await page.waitForTimeout(500);
    await shoot(page, join(OUT, "v8", vp.k), "home");
    await page.evaluate(() => window.openToken && window.openToken("NOVA")).catch(() => {});
    await page.waitForTimeout(400);
    await shoot(page, join(OUT, "v8", vp.k), "token");
    await page.evaluate(() => window.showView && window.showView("create")).catch(() => {});
    await page.waitForTimeout(300);
    await shoot(page, join(OUT, "v8", vp.k), "create");

    await ctx.close();
  }
  await browser.close();
  console.log("visual snapshots written to docs/visual-diff/{app,v8}/{desktop,mobile}/");
})().catch((e) => { console.error("visual failed:", e.message); process.exit(1); });
