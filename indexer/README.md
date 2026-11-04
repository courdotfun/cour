# COUR Indexer (Ponder)

Production [Ponder](https://ponder.sh) indexer for the COUR launchpad protocol on
**chain 4663 ("Robinhood Chain")**. It indexes token launches, bonding-curve
trades, graduations, fees, claims, buybacks, ERC-20 holder balances, and
post-graduation Uniswap v4 pool swaps — and exposes the data over GraphQL + REST.

Addresses and the start block mirror `../deployments/4663.json` (inlined in
`src/addresses.ts` so the indexer is self-contained). ABIs are generated from the
Foundry build artifacts into `abis/*.ts` (typed `as const`).

## What it indexes

| Source | Kind | Events |
| --- | --- | --- |
| `COURFactory` | static | `TokenLaunched`, `Graduated`, `StockSet`, `LaunchParamsSet`, `LaunchesPausedSet`, `LaunchAllowlistSet`, `LaunchAllowlistEnabledSet` |
| `COURFeeVault` | static | `FeeTaken`, `FeeClaimed`, `HolderClaimed`, `PlatformClaimed`, `BuybackExecuted`, `FeeRecipientChanged`, `TreasurySet` |
| `COURHook` | static | `FeeTaken` (post-graduation pool fees) |
| `COURRouter` | static | `EthInPathSet` |
| `PoolManager` | static | `Swap`, `ModifyLiquidity` — filtered to known COUR pool ids |
| `COURCurve` | **dynamic factory** | `CurveTrade` — one curve clone per token (`TokenLaunched.curve`) |
| `COURToken` | **dynamic factory** | ERC-20 `Transfer` — holder balances (`TokenLaunched.token`) |

> `CurveTrade` is emitted by the curve clones, `TokenLaunched`/`Graduated`/admin
> events by the factory, fee/claim/buyback events by the fee vault (plus
> `FeeTaken` from the hook), verified against `src/libraries/Events.sol`.

### USD pricing

Token USD price = `priceInStock × stockUsd(stock) / 1e18`. `stockUsd` is read from
`COURPriceReader.stockUsd(stock)` on-chain and cached per (stock, block); each read
is also snapshotted per-minute into the `stockPrice` table. If the TWAP is not
ready the contract reverts (`TwapNotReady`) — this is caught and USD values are
left `null` while stock-denominated values are kept.

## Schema

See `ponder.schema.ts`. Tables: `token`, `pool`, `trade`, `candle`, `holder`,
`feeEvent`, `claim`, `buyback`, `stockPrice`, `stock`, `userStats`, `globalStat`,
`poolLiquidityEvent`, `adminEvent`. Candles are kept at `1m/5m/1h/1d` in both
stock and USD terms. Holder rows carry an `isExcluded` flag (curve, pool manager,
fee vault, router, factory, dead, zero) so the API can report a true holder count.

## API

GraphQL is served at `/` and `/graphql` (auto-generated from the schema).

REST endpoints (Hono, in `src/api/index.ts`), all JSON:

| Route | Notes |
| --- | --- |
| `GET /tokens?filter=new\|trending\|graduating\|graduated&limit=&offset=` | token list |
| `GET /token/:addr` | token + live holder count |
| `GET /candles?token=&interval=1m\|5m\|1h\|1d&limit=` | OHLCV (ascending) |
| `GET /trades?token=&limit=&offset=` | recent trades (curve + pool) |
| `GET /holders?token=&limit=` | non-excluded holders by balance |
| `GET /portfolio/:addr` | holdings + est. USD value + user stats |
| `GET /top-users?limit=` | users by USD volume |
| `GET /stats` | global totals + unique holder count |

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PONDER_RPC_URL_4663` | yes | RPC endpoint for chain 4663. Ponder maps `PONDER_RPC_URL_<chainId>` automatically. |
| `DATABASE_URL` | prod only | Postgres connection string. If unset, dev uses the bundled pglite store. |
| `DATABASE_SCHEMA` | optional | Postgres schema/namespace for multiple deployments. |
| `PORT` | optional | HTTP port (default `42069`). |

Copy `.env.example` to `.env.local` and fill in values. Locally you can reuse the
repo RPC URL:

```bash
export PONDER_RPC_URL_4663="$(grep '^RH_RPC_URL=' ../.env | cut -d= -f2-)"
```

## Run — development

```bash
pnpm install
pnpm codegen            # ponder codegen — generates ponder-env.d.ts (virtual module types)
pnpm typecheck          # tsc --noEmit
pnpm dev                # ponder dev — pglite store, hot reload, GraphQL+REST on :42069
```

## Run — production

```bash
pnpm install --frozen-lockfile
DATABASE_URL=postgres://... PONDER_RPC_URL_4663=https://... pnpm start
```

`ponder start` runs the indexer and HTTP server together. For separate
API replicas, run `ponder start` on one node and `ponder serve` on others against
the same Postgres.

## Docker

> Docker was **not available** in the build environment, so the `Dockerfile` and
> `docker-compose.yml` are provided but **were not built/run locally**. Validate
> with `docker compose up --build` before relying on them.

```bash
# set PONDER_RPC_URL_4663 in a .env next to docker-compose.yml, then:
docker compose up --build
# GraphQL + REST on http://localhost:42069
```

## Deploy (pick one — human decision)

All three run the Docker image or a Node build with a managed Postgres.

- **Railway** — New Project → Deploy from repo (root = `indexer/`) + add a Postgres
  plugin. Set `PONDER_RPC_URL_4663`; `DATABASE_URL` is injected by the plugin.
  Start command `pnpm start`. Expose port `42069`.
- **Render** — Web Service from `indexer/` (Docker or Node). Add a Render Postgres,
  wire `DATABASE_URL`, set `PONDER_RPC_URL_4663`, start `pnpm start`, health check
  path `/` or `/stats`.
- **Fly.io** — `fly launch` in `indexer/` (uses the `Dockerfile`), `fly postgres
  create` + `fly postgres attach` (sets `DATABASE_URL`), `fly secrets set
  PONDER_RPC_URL_4663=...`, internal port `42069`.

Use a dedicated RPC endpoint with a high rate limit in production — see caveat
below.

## Notes / caveats

- Use a **dedicated RPC** (not the public endpoint). During historical backfill
  Ponder issues many `eth_getLogs`/`eth_getBlockByNumber` calls; the public COUR
  RPC returns `429 Too Many Requests` under that load. Ponder retries, but
  per-launch on-chain reads (`COURCurve.config()` for `vT0/vTStop/stockDecimals`
  and `COURToken.name()/symbol()`) can still exhaust retries and fall back to
  defaults (`name/symbol = null`, reserves `0`). Event-carried fields
  (`startPriceX`, `feeBps`, `mode`, `stock`, `creator`, `metadataURI`, …) are
  always correct. With a proper RPC these reads succeed.
- `trade.trader` for `source=pool` swaps is the PoolManager `sender` (router), not
  necessarily the end user — v4 Swap events do not carry the originating EOA.
- Curve-trade progress is recomputed from `vT0/vTStop` (read at launch) and the
  per-trade `vT` to mirror `COURCurve.progressBps()`.
