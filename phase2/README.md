# COUR Phase 2 — off-chain services (branch `phase2` only)

> **Do not merge to `master` or deploy.** Phase-1 contracts (`src/`) stay frozen at
> `audit-freeze-v1`. These services add value **without any contract change** by
> consuming the Phase-1 indexer. Full design in `docs/PHASE2_SPEC.md`.

Built here (no contract changes — safe to run before the public audit):

| Service | What | Contract? | Tests |
|---|---|---|---|
| `notifier/` | Telegram + web-push alerts from indexed events (new launch, graduation, large trade) with a pure rule engine + idempotent retry | No | `notifier/notifier.test.ts` |
| `screener/` | DexScreener + GeckoTerminal adapter: exposes COUR's v4 pools + bonding curves as the pair/asset/event/OHLCV schemas screeners ingest | No | `screener/map.test.ts` |
| `analytics/` | Volume/holder-growth/fee-distribution/launch-funnel/top-movers aggregations | No | `analytics/aggregate.test.ts` |

Features that **do** need contract changes (limit orders, mixed fee modes, paid LP)
are specified in `docs/PHASE2_SPEC.md` §4–6 but **not** implemented here — they must
go through `docs/audit/POST_AUDIT_PLAYBOOK.md` (new tag + audit), never on top of
the frozen deploy.

## Run

```bash
cd phase2
node --test                      # 20 unit tests, all pure/offline (Node >= 22.6, TS via type-strip)

INDEXER_URL=https://<indexer> node notifier/index.ts      # + TELEGRAM_BOT_TOKEN, RULES_JSON
INDEXER_URL=https://<indexer> node screener/server.ts     # :4900  DexScreener/GeckoTerminal adapter
INDEXER_URL=https://<indexer> node analytics/server.ts    # :4901  analytics API
```

## Notes on screener integration (real-world)

COUR uses Uniswap **v4** (singleton PoolManager, no per-pair contract) plus a
**bonding curve** pre-graduation — neither is auto-indexed by screeners the way
v2/v3 are. The `screener/` adapter makes COUR *technically eligible* by serving the
schemas DexScreener / GeckoTerminal ingest, but each still requires **manual partner
onboarding** (their form + review) and a stable public adapter URL + RPC for chain
4663. GMGN has no stable public spec — serve the generic pair/trade feed and contact
them for whitelisting.
