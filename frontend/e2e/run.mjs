// Build the app with the fixture indexer URL baked in (Vite inlines
// import.meta.env at build time), then run the Playwright UI E2E. Cross-platform
// (Node passes env to children). The RPC URL points at a dead port so on-chain
// fallbacks fail fast instead of hitting the real network during the UI E2E.
import { spawnSync } from "node:child_process";

const env = {
  ...process.env,
  VITE_INDEXER_URL: process.env.VITE_INDEXER_URL || "http://localhost:4788",
  VITE_RPC_URL: process.env.VITE_RPC_URL || "http://localhost:4799",
  VITE_WC_PROJECT_ID: "",
  VITE_PINATA_JWT: "",
  PREVIEW_PORT: process.env.PREVIEW_PORT || "4793",
  FIXTURE_PORT: process.env.FIXTURE_PORT || "4788",
};

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("[e2e] building app with VITE_INDEXER_URL=" + env.VITE_INDEXER_URL);
run("pnpm", ["build"]);
console.log("[e2e] running Playwright UI E2E (system Chrome)…");
run("pnpm", ["exec", "playwright", "test"]);
