// Headless smoke test: load the built app via `vite preview`, drive it across
// views + themes + viewports with system Chrome (puppeteer-core), and assert
// there are no console errors. Screenshots saved to ./screenshots.
//
// Usage: pnpm build && pnpm smoke
import { spawn } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import puppeteer from "puppeteer-core";

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const OUT = new URL("../screenshots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function findChrome() {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    process.env.CHROME_PATH,
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

const VIEWS = ["home", "create", "token", "profile", "pools"];
const THEMES = ["classic", "cartoon", "light"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = findChrome();
  if (!chrome) {
    console.error("SMOKE: no system Chrome/Edge found. Set CHROME_PATH. Aborting (NOT a pass).");
    process.exit(2);
  }
  console.log("SMOKE: using browser", chrome);

  // Optionally start the deterministic indexer fixture so the matrix loads real
  // (fixed) data fast instead of waiting on a live RPC. Enabled with FIXTURE=1.
  let fixture = null;
  if (process.env.FIXTURE === "1" || process.argv.includes("--fixture")) {
    fixture = spawn("node", ["e2e/fixtures/indexer-fixture.mjs"], {
      cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      shell: true,
      stdio: "inherit",
      env: { ...process.env, FIXTURE_PORT: "4788" },
    });
  }

  const preview = spawn("pnpm", ["preview", "--port", String(PORT), "--strictPort"], {
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    shell: true,
    stdio: "inherit",
  });

  const up = await waitForServer(BASE);
  if (!up) {
    console.error("SMOKE: preview server did not start.");
    preview.kill();
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const errors = [];
  let shots = 0;
  try {
    for (const vp of VIEWPORTS) {
      for (const theme of THEMES) {
        const page = await browser.newPage();
        await page.setViewport({ width: vp.width, height: vp.height });
        const pageErrors = [];
        // Network-resource noise (RPC/indexer down in this sandbox) is not an app
        // defect — the UI handles it gracefully. Only real JS/page errors fail.
        const isNetNoise = (t) => /Failed to load resource|ERR_CONNECTION_REFUSED|ERR_NETWORK|net::/i.test(t);
        page.on("console", (msg) => {
          if (msg.type() === "error" && !isNetNoise(msg.text())) pageErrors.push(`[console.error] ${msg.text()}`);
        });
        page.on("pageerror", (err) => {
          if (!isNetNoise(err.message)) pageErrors.push(`[pageerror] ${err.message}`);
        });

        // Seed theme before the app boots.
        await page.evaluateOnNewDocument((t) => {
          try {
            localStorage.setItem("cour-theme", t);
          } catch {}
        }, theme);

        try {
          await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
        } catch (e) {
          pageErrors.push(`[goto] ${String(e).slice(0, 120)}`);
        }
        await sleep(1500); // let the design script + module boot (RPC calls may be slow/offline)

        for (const view of VIEWS) {
          try {
            await page.evaluate((v) => {
              if (typeof window.showView === "function") window.showView(v);
            }, view);
          } catch {}
          await sleep(350);
          const file = `${OUT}${vp.name}-${theme}-${view}.png`;
          await page.screenshot({ path: file });
          shots++;
        }

        // Sanity: window.COUR must be present (real app layer booted).
        const hasApi = await page.evaluate(() => !!window.COUR && !!window.COUR.chain);
        if (!hasApi) pageErrors.push("[assert] window.COUR not initialised");

        if (pageErrors.length) {
          errors.push(`${vp.name}/${theme}: ${pageErrors.join(" | ")}`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
    preview.kill();
    if (fixture) fixture.kill();
  }

  console.log(`SMOKE: captured ${shots} screenshots in ${OUT}`);
  if (errors.length) {
    console.error("SMOKE: console/page errors found:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log("SMOKE: PASS — no console errors across views/themes/viewports.");
}

main().catch((e) => {
  console.error("SMOKE: crashed", e);
  process.exit(2);
});
