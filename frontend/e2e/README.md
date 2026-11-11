# COUR frontend — E2E & smoke

Three layers of browser checks, all using **system Chrome** (no Playwright
browser download needed — `channel: "chrome"`).

## 1. `pnpm e2e` — deterministic UI E2E (runs anywhere, no chain)

`node e2e/run.mjs` builds the app with the **indexer fixture** baked in
(`VITE_INDEXER_URL=http://localhost:4788`) and a dead RPC, then runs
`e2e/ui.spec.ts` via Playwright. It proves the design renders **100% real data**
(the demo `tokens` array is gone) and the wiring works:

- home list renders the fixture tokens (`CSMOKE`, `GRAD1`); the old demo tickers
  (`NOVA`, `PixelForge`, …) are absent;
- the token page shows a **real price** and a **real candle chart** (from
  `/candles`);
- the create view + launch form exist;
- wallet **connect** works through an injected EIP-6963 mock
  (`e2e/fixtures/mock-wallet.js`);
- the portfolio data layer returns real positions from `/portfolio/:addr`.

Network-resource errors are ignored (the UI E2E runs with no RPC on purpose);
any real JS/page error fails the run.

## 2. `pnpm smoke` / `pnpm smoke:fixture` — 5×3×2 visual matrix

`scripts/smoke.mjs` loads the built app and drives **5 views × 3 themes × 2
viewports = 30 screenshots** (saved to `screenshots/`), asserting no console/JS
errors and that `window.COUR` booted. `pnpm smoke:fixture` (or `FIXTURE=1`)
starts the indexer fixture first so the matrix loads real data fast.

## 3. `pnpm e2e:fork` — FULL on-chain flow (needs a prepared fork)

`e2e/fork.spec.ts` drives the real UI through **connect → buy → sell → launch →
claim/buyback** against an **anvil fork of Robinhood Chain (4663)**, using an
injected provider that forwards JSON-RPC to the fork (anvil auto-impersonates the
test account — no key in the browser). It is **skipped** unless `COUR_FORK_E2E=1`.

The same flow (incl. graduation → pool swap → holder dividend) is also proven
headlessly by the Foundry fork tests (`test/fork/*.t.sol`) and the rehearsal
(`script/run_fork_rehearsal.sh`).

### Prerequisites (human/CI)

```bash
# 1. fork 4663 locally (needs a real RPC)
anvil --fork-url "$RH_RPC_URL" --auto-impersonate --chain-id 4663 --port 8545

# 2. fund + allowlist + seed the test account on the fork
node e2e/fork-setup.mjs    # impersonates owner → setLaunchAllowlist(acct,true);
                           # deals ETH + USDG/NVDA to the test account

# 3. build the app pointing at the fork
VITE_RPC_URL=http://127.0.0.1:8545 VITE_INDEXER_URL= pnpm build

# 4. run the fork E2E
COUR_FORK_E2E=1 FORK_RPC=http://127.0.0.1:8545 \
  FORK_ACCOUNT=0x1eb25d02fc7C5487D4648a602c355dBC2301030b \
  pnpm exec playwright test e2e/fork.spec.ts
```

> Not run in this sandbox (no funded fork of 4663 reachable). The contract-level
> flow is already green in `test/fork/*`; this spec adds UI-call coverage.

## 4. `pnpm lighthouse` — performance/a11y/best-practices gate (≥85)

`scripts/lighthouse.mjs` serves the build, runs Lighthouse via system Chrome, and
fails if Performance / Accessibility / Best-Practices drop below `LH_MIN` (85).
Requires `pnpm add -D lighthouse chrome-launcher`.
