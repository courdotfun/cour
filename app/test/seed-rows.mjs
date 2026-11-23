// One-off: seed docs/visual-diff/parity/rows.json from the committed VISUAL_PARITY.md
// (home/token/create — already-measured, stable) + the profile fix-loop logs, so the
// merge-aware parity.mjs can regenerate the complete report after a fast ONLY=<view> run
// instead of re-measuring the stable views (a full matrix is ~45 min). Idempotent.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";

const THEMES = ["classic", "cartoon", "light"];
const OUT = "C:/Users/Lenovo/cour/docs/visual-diff/parity";
const scalesOf = (w) => w >= 900 && w < 1920;
const rows = [];

// 1) committed home/token/create rows from the main table (before "## AA exceptions").
const doc = execSync("git show abe946b:docs/VISUAL_PARITY.md", { encoding: "utf8" });
const mainTable = doc.split("## AA exceptions")[0];
for (const line of mainTable.split("\n")) {
  const m = line.match(/^\|\s*(home|token|create)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(classic|cartoon|light)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*(✅ᴬᴬ|✅|❌)\s*\|/);
  if (!m) continue;
  const [, view, w, dpr, theme, pre, scaled, res] = m;
  rows.push({ view, w: +w, dpr: +dpr, theme, pre: +pre, scaled: +scaled, scales: scalesOf(+w),
    pass: res !== "❌", aaEx: res === "✅ᴬᴬ", note: "" });
}

// 2) profile rows from the fix-loop logs ("profile 320@1 classic: pre 0.000 scaled 0.000 PASS").
const seen = new Set();
const TMP = "C:/Users/Lenovo/AppData/Local/Temp";
for (const f of [`${TMP}/prof320.log`, `${TMP}/prof2.log`]) {   // prefer the 320 re-run (cleared ERRs)
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^profile (\d+)@(\d+) (classic|cartoon|light): pre ([\d.]+|ERR) scaled ([\d.]+|ERR) (PASS|FAIL)/);
    if (!m) continue;
    const [, w, dpr, theme, pre, scaled, res] = m;
    const k = `${w}|${dpr}|${theme}`;
    if (seen.has(k) || pre === "ERR") continue;   // skip the transient ERR rows; 320 re-run supplies them
    seen.add(k);
    rows.push({ view: "profile", w: +w, dpr: +dpr, theme, pre: +pre, scaled: +scaled, scales: scalesOf(+w),
      pass: res === "PASS", aaEx: false, note: "" });
  }
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
writeFileSync(OUT + "/rows.json", JSON.stringify(rows));
const byView = {};
for (const r of rows) byView[r.view] = (byView[r.view] || 0) + 1;
console.log("seeded rows.json:", JSON.stringify(byView), "total", rows.length);
