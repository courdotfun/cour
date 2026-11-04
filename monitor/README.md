# COUR monitor

Monitoring & alerting service for the COUR protocol on Robinhood Chain (chainId **4663**).

It watches on-chain events, runs periodic health reads, raises severity-tagged
alerts (Telegram or console), and exposes a read-only HTTP status API for an
admin page / uptime checker.

Addresses and `startBlock` are loaded from `../deployments/4663.json` — the
monitor has no hard-coded addresses.

## What it watches

**Events** (viem `watchEvent`, polling):

| Event | Contract | Severity |
|---|---|---|
| `TokenLaunched` | Factory | info |
| `Graduated` | Factory | info |
| `BuybackExecuted` | FeeVault | info |
| `PlatformClaimed` | FeeVault | info |
| `FeeTaken` (large only, `>= LARGE_FEE_STOCK`) | Hook + FeeVault | warn |
| `LaunchParamsSet` | Factory | warn |
| `LaunchesPausedSet` | Factory | critical when paused |
| `LaunchAllowlistEnabledSet` / `LaunchAllowlistSet` | Factory | warn / info |
| `StockSet` | Factory | warn |
| `TreasurySet` | FeeVault | warn |
| `EthInPathSet` | Router | warn |
| `OwnershipTransferred` | Factory, FeeVault, Router, PriceReader | **critical** |

**Periodic health reads** (every `HEALTH_INTERVAL_MS`):

- Latest block (liveness).
- Deployer ETH balance; alert below `DEPLOYER_MIN_ETH`.
- `PriceReader.stockUsd(NVDA)`: value, source, and sharp-deviation detection
  (`>= STOCK_DEVIATION_PCT` between reads). A revert is treated as a
  TWAP-not-ready / oracle anomaly (critical).
- `factory.launchesPaused` and `launchAllowlistEnabled` — alerts on change.
- `owner()` of every core contract — alerts on change (belt-and-suspenders
  alongside the `OwnershipTransferred` watcher).
- Stock-issuer pause probe: static-calls `paused()` on the stock token. If the
  token does not expose it the probe records `null` (**manual check required** —
  see the runbook).

All alerts are de-duplicated per key within `ALERT_DEDUPE_MS`.

## Requirements

- Node >= 22 (tested on v24). pnpm.
- A Robinhood Chain RPC URL.

## Setup

```bash
cd monitor
pnpm install
cp .env.example .env      # then edit .env
```

Set at minimum `MONITOR_RPC_URL`. In this repo that is the value of
`RH_RPC_URL` in the top-level `.env`. For a quick local run without editing a
file:

```bash
export MONITOR_RPC_URL="$(grep '^RH_RPC_URL=' ../.env | cut -d= -f2-)"
```

The RPC URL and Telegram token are never logged.

## Run

```bash
pnpm typecheck     # tsc --noEmit
pnpm start         # run the monitor
pnpm dev           # run with auto-restart on change
```

Startup prints a banner, a first health line with live on-chain reads, and the
list of watched contracts, e.g.:

```
[INFO] health {"block":"106228166","deployerEth":"0.001469","stockUsdNvda":"201.4291","stockSource":1,"twapReady":true,"launchesPaused":false,"allowlistEnabled":true,"stockPaused":false}
```

Stop with Ctrl-C (SIGINT) / SIGTERM — it unwinds watchers, the health loop, and
the HTTP server.

## HTTP status API

Binds to `HTTP_HOST:HTTP_PORT` (default `127.0.0.1:8080`).

- `GET /health` — `{ ok, lastBlock, lastBlockAt, lastHealthCheckAt, lastError }`.
  Returns 200 when a block has been seen and no error, else 503. Point an uptime
  checker here.
- `GET /status` — full observed snapshot: addresses, balances, paused/allowlist
  state, last NVDA price, per-contract owners, and alert counters. Intended for
  the admin page.

Bind to `0.0.0.0` only behind a trusted proxy; the endpoints are read-only but
expose operational metadata.

## Configuration

All via env (see `.env.example`). Required: `MONITOR_RPC_URL`. Everything else
has a default. Telegram is optional — unset `TELEGRAM_BOT_TOKEN` /
`TELEGRAM_CHAT_ID` and alerts print to the console.

## Deploy options

No Docker required.

- **systemd** — a unit running `pnpm start` with `EnvironmentFile=/etc/cour-monitor.env`,
  `Restart=always`. SIGTERM triggers graceful shutdown.
- **pm2** — `pm2 start "pnpm start" --name cour-monitor` (cwd `monitor/`), then
  `pm2 save`.
- **tmux/nohup** — for a quick always-on box: `nohup pnpm start > monitor.log 2>&1 &`.

Run a single instance (alert de-dup is in-process). Put `/health` behind an
external uptime check (UptimeRobot, Better Stack, etc.) so you are alerted if the
monitor itself dies.

## Incident response

See [`../docs/INCIDENT_RUNBOOK.md`](../docs/INCIDENT_RUNBOOK.md) for scenario
playbooks (contract bug, stock paused, oracle anomaly, frontend/indexer down,
key compromise) and exact commands.
