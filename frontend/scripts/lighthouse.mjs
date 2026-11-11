// Lighthouse runner. Serves the built app with `vite preview`, launches system
// Chrome, runs Lighthouse, and fails if Performance/Best-Practices/Accessibility
// fall below the threshold (default 85). Requires the `lighthouse` package:
//   pnpm add -D lighthouse chrome-launcher
//
// Usage: pnpm build && pnpm lighthouse   (LH_MIN=85 to tune the gate)
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";

const PORT = Number(process.env.LH_PORT || 4194);
// Measure a remote URL (deployed site) when LH_URL is set; else serve dist locally.
const REMOTE = process.env.LH_URL || "";
const BASE = REMOTE || `http://localhost:${PORT}/`;
const MIN = Number(process.env.LH_MIN || 85);

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

async function waitForServer(url, tries = 60) {
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
  let lighthouse, chromeLauncher;
  try {
    ({ default: lighthouse } = await import("lighthouse"));
    chromeLauncher = await import("chrome-launcher");
  } catch {
    console.error(
      "LIGHTHOUSE: the 'lighthouse' + 'chrome-launcher' packages are not installed.\n" +
        "Install them and re-run:  pnpm add -D lighthouse chrome-launcher && pnpm build && pnpm lighthouse",
    );
    process.exit(2);
  }

  const chromePath = findChrome();
  const preview = REMOTE
    ? null
    : spawn("pnpm", ["preview", "--port", String(PORT), "--strictPort"], {
        cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
        shell: true,
        stdio: "inherit",
      });
  if (!REMOTE) {
    const up = await waitForServer(BASE);
    if (!up) {
      console.error("LIGHTHOUSE: preview server did not start.");
      preview?.kill();
      process.exit(2);
    }
  } else {
    console.log("LIGHTHOUSE: measuring remote", BASE);
  }

  const chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const desktop = process.env.LH_FORM === "desktop";
    const settings = desktop
      ? {
          onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
          formFactor: "desktop",
          screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
          throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
        }
      : { onlyCategories: ["performance", "accessibility", "best-practices", "seo"] };
    console.log("LIGHTHOUSE form factor:", desktop ? "desktop" : "mobile (default)");
    const runnerResult = await lighthouse(
      BASE,
      { port: chrome.port, output: "json", logLevel: "error" },
      { extends: "lighthouse:default", settings },
    );
    const cats = runnerResult.lhr.categories;
    const scores = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, Math.round((v.score || 0) * 100)]));
    console.log("LIGHTHOUSE scores:", scores);
    const a = runnerResult.lhr.audits;
    const metric = (id) => a[id]?.displayValue ?? "n/a";
    console.log("LIGHTHOUSE metrics:", {
      FCP: metric("first-contentful-paint"),
      LCP: metric("largest-contentful-paint"),
      TBT: metric("total-blocking-time"),
      CLS: metric("cumulative-layout-shift"),
      SI: metric("speed-index"),
      TTI: metric("interactive"),
    });
    const opps = Object.values(a)
      .filter((x) => x.details?.type === "opportunity" && (x.details.overallSavingsMs || 0) > 50)
      .sort((x, y) => (y.details.overallSavingsMs || 0) - (x.details.overallSavingsMs || 0))
      .slice(0, 8)
      .map((x) => `${x.id} (~${Math.round(x.details.overallSavingsMs)}ms)`);
    console.log("LIGHTHOUSE top opportunities:", opps);
    const gated = ["performance", "accessibility", "best-practices"];
    const failed = gated.filter((k) => (scores[k] ?? 0) < MIN);
    if (failed.length) {
      console.error(`LIGHTHOUSE: below ${MIN} on: ${failed.map((k) => `${k}=${scores[k]}`).join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log(`LIGHTHOUSE: PASS — all gated categories >= ${MIN}.`);
    }
  } finally {
    await chrome.kill();
    preview?.kill();
  }
}

main().catch((e) => {
  console.error("LIGHTHOUSE: crashed", e);
  process.exit(2);
});
