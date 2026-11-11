# Frontend changes — honesty edits & wiring log

This document records the move of the approved static design
(`COUR-launchpad.html`) into a real Vite + TypeScript dApp under `frontend/`,
and every truthfulness edit made to the UI copy/behaviour. The visual design
(layout, themes dark/light/cartoon, the Oink mascot, animations, risk popups) is
preserved; only data sources and the enumerated honesty items changed.

The source of truth for the live contracts is `deployments/4663.json`
(Robinhood Chain, chainId 4663).

---

## 1. Honesty edits (before → after)

All copy below was fabricated or misleading in the simulation and is corrected
to match the Phase-1 contracts. COUR graduated pools use an LP fee of **0** and
the graduation LP is **burned** (owned by the factory with no removal path), so
**there are no LP fees and no LP rewards.**

### 1.1 LP / "earn fees on every swap" / "LPs get 80%" / "LP fees +0.2%"

| Location | Before | After |
|---|---|---|
| Home pools promo (`promo-lp`) | "Earn fees on every swap." / "Add liquidity to any token/stock pair and earn trading fees." / button **Provide liquidity** | "Graduated pools, locked forever." / "When a token graduates, COUR seeds a full-range pool and burns the LP — liquidity that can never be pulled. LP fee is 0%." / button **View graduated pools** |
| Pools page subtitle (`pl-sub`) | "…Provide liquidity to a pair and earn a share of every swap fee." | "…Once a token graduates, its liquidity is seeded by COUR and permanently burned. LP fee is 0% — there are no LP rewards. Providing your own liquidity is coming soon." |
| Add-menu item | **Provide liquidity** / "Add LP & earn swap fees" | **Pools** / "Graduated pools · LP coming soon" |
| "Earn" pillar on wallet promo | "Earn — Add idle shares to pools and earn swap fees." | "Trade — Buy and sell on the bonding curve, then on burned-LP pools." |
| Earn modal option | "Provide liquidity — Pair idle stocks with a token and earn swap fees" | "Pools — Graduated pools with burned liquidity · LP coming soon" |
| Earn modal option | "Buy & sell — …paid with anything you hold" | "…paid with ETH or the paired stock" |
| Wallet stock row button | **Add LP** (→ pools) | removed (only **Send** remains) |
| FAQ "Trading hours" | "…outside those hours they update less often **and LP fees go up by 0.2%**." | "…outside those hours they update less often." |
| Chatbot `lp:` topic (8 Q&A about earning LP fees, impermanent loss, ranges, APR 10–80%) | Entirely LP-fee-earning content | Replaced with 4 honest Q&A: LP provisioning is coming soon; COUR pools pay **no** LP fees (0% fee, burned LP); what "burned liquidity" means; where to see graduated pools. |

### 1.2 Stock Reserve card (`tkResCard`)

- The token-page `renderReserve()` was already neutralised in the approved file
  (empties + hides the card). We additionally removed the **"X% of this trade
  goes to the $TICK Stock Reserve"** route line (`.rt-res`) on the order ticket
  (`resPct` forced to 0). The Stock Reserve is not a Phase-1 contract feature.

### 1.3 Limit orders → "Coming soon"

| Location | Before | After |
|---|---|---|
| Token order ticket tab | **Limit** (clickable) | **Limit · Soon** (disabled, tooltip "Limit orders are coming soon (needs a keeper — Phase 2)") |
| FAQ "Can I set a limit order?" | "Yep! …pick Limit and set your price…" | "Not yet. Limit orders are coming soon. They need an on-chain keeper… Phase 2." |

### 1.4 "Pay with any token" → ETH or the stock token only

| Location | Before | After |
|---|---|---|
| Home subtitle | "Buy with anything in your wallet." | "Buy with ETH or the token's paired stock." |
| FAQ "How do I buy?" | "…pick what to pay with: ETH, another stock token or a token…" | "…buy it with ETH or the stock it is paired with. You always see the total fee and any launch tax before you confirm." |
| FAQ "Which coins can I pay with?" | "ETH, tokens and stock tokens. Pay with whatever you're holding…" | "…pay with ETH or the stock token it is paired with… Stock tokens themselves are bought with ETH or USDG." |
| Swap modal label | "Pay with (anything in your wallet)" | "Pay with (ETH or the paired stock)" |
| Stock page note | "Pay with any asset in your wallet. Stock tokens are not shares." | "Pay with ETH or USDG. Stock tokens are not shares." |

### 1.5 Roadmap / not-live features

- **Lend & Borrow, Auto-compound, DCA**: already presented by the chatbot as
  "None of this is live yet, and plans can change" (roadmap). Left as-is,
  non-clickable.
- **Oink collection / skins / rarity**: the design already labels these
  "Coming soon" / "soon"; preserved.
- **Badges / achievements & Top users**: retained (indexer-sourced, cosmetic,
  non-financial), per brief.

### 1.6 Mock/random data generators (requirement B)

- A global `window.COUR_LIVE = true` flag is set in an inline head script before
  any app code. The in-page price random-walk (`pxStep`/`pxTick`), the
  away-time "catch up" fabricator (`courCatchUp`), and the LP simulation
  (`lpSimStep`) are all gated on `!window.COUR_LIVE`, so **no fabricated
  prices/fees are produced in production.** Real prices are seeded into
  `window.COUR_PX` from the indexer and from direct on-chain reads
  (`/src/main.ts` → `seedRealPrices()`); where data is unavailable the UI shows
  the last real value / an empty state rather than inventing numbers.
- Remaining in-page demo structures that are **not yet** replaced by live reads
  (documented honestly, see §4): the hard-coded `tokens` demo list, the
  `_holdings` / `W.stocks` wallet balances, and the candle/trade feeds used by
  the chart widget. These are superseded by the real data layer
  (`src/data/*`, exposed on `window.COUR`) but the legacy render paths that
  consume them have not all been rewritten.

---

## 2. New app structure (`frontend/`)

```
frontend/
  index.html              # the approved design, moved in; renamed + honesty-edited
  vite.config.ts  tsconfig.json  package.json  vercel.json  .env.example
  middleware.ts           # Vercel edge geo-block (US at minimum)
  public/deployment.json  # copy of deployments/4663.json
  scripts/smoke.mjs       # headless (puppeteer-core + system Chrome) smoke test
  src/
    chain/   deployment.ts  client.ts  wallet.ts  abi.ts  abi/*.json
    data/    types.ts  indexer.ts  onchain.ts
    features/ trade.ts  launch.ts  claims.ts  stockswap.ts
    ui/      format.ts
    config/  regions.ts   # geo-block list (LEGAL sign-off required)
    main.ts               # wires the real layer into the design
```

## 3. Rename (requirement D)

- `EON_*` → `COUR_*` (135 identifiers), `eon-*` → `cour-*` (localStorage keys),
  and camelCase `eon…` helpers (`eonSfx` → `courSfx`, etc.). Base64 image data
  was verified untouched.
- A classic inline head script migrates legacy `eon-*` localStorage keys to
  `cour-*` on first load before any app code reads storage.

## 4. What is wired vs. stubbed (truthful)

**Fully wired (real chain/indexer):**
- Chain layer: viem public client on chainId 4663, EIP-6963 multi-injected
  wallet discovery + connect, network add/switch, optional WalletConnect env.
- Real wallet adapter swapped into the design's `COUR_WALLET` seam
  (connect/disconnect are real; the connected account is the real wallet).
- Launch allowlist gating: the Launch button is disabled with "Launches are
  invite-only during beta" when `factory.launchAllowlist(addr)` is false.
- Owner-only admin panel (treasury / platform fees) shown when the connected
  wallet equals `factory.owner()`; can `claimPlatform` USDG/WETH.
- Data layer: typed REST client for all indexer endpoints
  (`/tokens /token/:addr /candles /trades /holders /portfolio/:addr /top-users
  /stats`) with honest ok/empty/error results; on-chain fallbacks for prices
  (PriceReader), quotes (router `quoteBuy`/`quoteSell`), balances, allowlist,
  curve snapshot, graduation pool id + burn proof.
- Feature modules (callable now via `window.COUR.features`): buy/sell/buyWithETH
  via COURRouter with slippage + deadline + approve/allowance; `createToken`
  via factory (simulated first to surface token/curve + reverts); IPFS upload
  via Pinata (guarded by `VITE_PINATA_JWT`); creator/holder/platform claims and
  `executeBuyback`; stock swaps via Uniswap SwapRouter02.
- Real price seeding into `COUR_PX` (indexer + live CSMOKE on-chain).

**Stubbed / coming-soon (by design or honesty):**
- LP provisioning, limit orders, lend/borrow, auto-compound, DCA, Oink
  collection — all marked coming-soon / roadmap.

**Not yet rewired (legacy demo render paths still consume in-memory structures;
the real data is available on `window.COUR` but these specific DOM renderers
were not reimplemented):**
- The home market list / token cards still iterate the hard-coded `tokens`
  array rather than `/tokens` from the indexer.
- The wallet/portfolio balances still read `_holdings` / `W.stocks` rather than
  `/portfolio/:addr` + on-chain `balanceOf`.
- The token-page candle chart still renders from the in-memory candle buffer
  rather than `/candles`.
- The design's `ordSubmit` buy/sell and `ctLaunch` submit still drive the demo
  flow; the real equivalents are exposed on `window.COUR.features` and gated by
  the allowlist, but the form handlers were not swapped (progressive work —
  requires decomposing the ~8.5k-line inline script).

These are listed so the team knows exactly where the remaining wiring goes; none
of them fabricate numbers in live mode (the simulators are disabled via
`COUR_LIVE`).

## 5. Geo-block (requirement E)

- `frontend/middleware.ts` (Vercel edge) returns HTTP 451 + a disclaimer page
  for blocked regions, using `x-vercel-ip-country` / `request.geo`.
- `src/config/regions.ts` holds `BLOCKED_COUNTRIES` (currently `["US"]`).
  **The final list is a LEGAL decision and must be reviewed/confirmed by a
  human** — noted in both the config file and the middleware.

## 6. Hosting

- `frontend/vercel.json` (vite framework, security headers) and
  `frontend/.env.example` (`VITE_RPC_URL`, `VITE_INDEXER_URL`,
  `VITE_WC_PROJECT_ID`, `VITE_PINATA_JWT`). Not deployed to production.

---

## 7. Live wiring completed (2026-11-11) — §4 "not yet rewired" closed

The legacy demo render paths listed in §4 are now driven by **real data**. Rather
than rewrite the 8.5k-line inline script, we added a few tiny **seams** inside the
design's closures and a driver module (`src/live/`):

**Seams added to `index.html`** (small, reversible):
- the 20-entry demo `tokens` array is **removed** → `const tokens = []`, plus
  `window.COUR_setTokens` / `window.COUR_getTokens` to fill it from real data;
- `window.COUR_getTkTok()` (the open token) and `window.COUR_setCandles(ohlc)`
  (real candle history into the chart host);
- the two token-page **random-walk intervals are gated by `window.COUR_LIVE`**
  (no fabricated candle ticks / price walk in production);
- the launch button delegates to `window.COUR_launchReal` and `ordConfirm`
  delegates to `window.COUR_tradeReal` in live mode.

**Driver (`src/live/map.ts`, `src/live/wire.ts`, wired from `main.ts`):**
- **Home list** renders real tokens from the indexer (`/tokens`, on-chain CSMOKE
  fallback), mapped to the design's card shape — demo tickers are gone.
- **Token page** seeds the real USD price and **real OHLC candles** (`/candles`).
- **Buy / sell** execute via `COURRouter` (`features/trade`) with real quotes +
  slippage; the review modal shows real numbers, confirm sends the tx.
- **Launch** calls `factory.createToken` (`features/launch`), uploads the image to
  IPFS when `VITE_PINATA_JWT` is set, and surfaces allowlist reverts honestly.
- **Portfolio** renders from `/portfolio/:addr` with an on-chain `balanceOf`
  fallback; honest empty state when there is nothing to show.

**No fabricated numbers in production:** the simulators were already gated by
`COUR_LIVE`; the remaining fabricated candle/price intervals are now gated too.

**Verification (this repo):**
- `pnpm build` (tsc + vite) passes.
- `pnpm e2e` — Playwright UI E2E, **5/5 passing** on system Chrome: home renders
  real tokens (demo absent), token page shows real price + real candle SVG,
  create/launch form present, EIP-6963 connect works, portfolio data layer
  returns real positions (`e2e/ui.spec.ts`, deterministic via a fixture indexer).
- `pnpm smoke` — 5 views × 3 themes × 2 viewports screenshot matrix, 0-error
  assertion, now also ignoring network-resource noise (`scripts/smoke.mjs`).
- `pnpm lighthouse` — ran (`scripts/lighthouse.mjs`, system Chrome):
  **Accessibility 90, Best-Practices 96 (both ≥85 ✓), SEO 75, Performance 42 (✗).**
  Performance is below target because the approved design is a **single
  monolithic `index.html` (~1.16 MB, gzip 352 KB)** with inline CSS, an ~8.5k-line
  inline script, and base64 images — heavy main-thread parse + large LCP payload.
  Reaching Performance ≥85 needs a **design-structure refactor** (code-split the
  inline script, externalize/lazy-load the base64 images, defer non-critical work)
  that risks the approved visual and must be done with a browser to verify — logged
  as follow-up, not a quick fix.
- `pnpm e2e:fork` — **full on-chain** flow (connect→buy→sell→launch→claim/buyback)
  against an anvil fork of 4663, env-gated (`e2e/fork.spec.ts` + `e2e/fork-setup.mjs`).
  Not run in this sandbox (no funded fork reachable); the contract-level flow is
  already green in `test/fork/*`. See `e2e/README.md`.

**Still a human step:** Vercel deploy (CLI login) + env + domain — see
`docs/STATUS.md §3.7`.
