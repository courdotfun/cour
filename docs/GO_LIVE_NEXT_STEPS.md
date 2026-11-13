# Go-Live — exact remaining steps (operator runbook)

Updated **2026-11-13**. Everything that could be done autonomously is done.

**✅ COMPLETED since this doc was written:**
- Frontend **LIVE** at https://cour.fun (+ server-side Pinata upload, WalletConnect).
- **Indexer LIVE** — `https://indexer-production-f5ef70d7.up.railway.app` (+ Postgres), backfilling.
- **Monitor LIVE** — `https://monitor-production-8079dfd3.up.railway.app` (log-only).
- **`VITE_INDEXER_URL`** set (prod+preview); frontend redeployed.
- **Safe 2-of-3** deployed + ownership transfer to Safe **initiated** (option a).

**⏳ REMAINING (you):**
1. **Safe `acceptOwnership` (2-of-3)** → import `deployments/safe-accept-ownership.json` (see `HANDOVER.md`).
2. **Top up deployer ETH** (0.0215 < 0.05 — monitor alerts) for future admin gas.
3. **Rotate `RAILWAY_TOKEN`** (it was shared in chat).
4. **Later, before public:** 48h Timelock handover (`04_HandOver`), then `setLaunchAllowlistEnabled(false)`.

The credential-based runbook below is kept for reference / re-deploys.

`src/` stays frozen (`audit-freeze-v1`). Allowlist stays **enabled**. Never commit secrets.

---

## What's blocking what

| Task | Blocker | You provide |
|---|---|---|
| Indexer → Railway | no `RAILWAY_TOKEN` in `.env` | `RAILWAY_TOKEN` (or run `railway login`) |
| Monitor → Railway | no `RAILWAY_TOKEN` (+ Telegram optional) | `RAILWAY_TOKEN`, optional `TELEGRAM_*` |
| `VITE_INDEXER_URL` on Vercel | indexer not deployed yet | nothing — auto after indexer is up |
| `VITE_WC_PROJECT_ID` | value not available | free at https://cloud.reown.com |
| `VITE_PINATA_JWT` | value not available | https://pinata.cloud (JWT) |
| Safe 2-of-3 + Timelock handover | no `OWNER_1/2/3` in `.env` | 3 distinct owner addresses (≠ deployer) |

To unblock the indexer+monitor automatically: add **one line** to `.env`:

```
RAILWAY_TOKEN=<your Railway account or project token>
```

Get a token at: Railway → Account Settings → **Tokens** (account token), or a
Project → Settings → **Tokens** (project token). I poll `.env` every ~2 min and
will run the deploys as soon as the token appears.

---

## 1. Indexer on Railway (CLI, token-based — no GitHub)

RPC: use the repo's `RH_RPC_URL` for `PONDER_RPC_URL_4663` (the indexer example
derives it from exactly this). If that endpoint 429s during backfill, swap in a
dedicated 4663 RPC. Start block `106215255` is pinned in code.

```bash
cd indexer
export RAILWAY_TOKEN=<token>                       # from .env
PONDER_RPC=$(grep '^RH_RPC_URL=' ../.env | cut -d= -f2-)

npx -y @railway/cli init --name cour-indexer       # create project
npx -y @railway/cli add --database postgres        # Postgres → injects DATABASE_URL
npx -y @railway/cli variables --set "PONDER_RPC_URL_4663=$PONDER_RPC"
npx -y @railway/cli up --detach                    # build Dockerfile + deploy
npx -y @railway/cli domain                         # generate public URL
```

`railway.json` already sets the Dockerfile builder, start command
(`ponder start --schema public --hostname 0.0.0.0 --port $PORT`) and healthcheck
`/health`. `DATABASE_URL` and `PORT` are injected by Railway.

**Verify (after backfill from block 106215255 completes):**

```bash
IDX=https://<cour-indexer-domain>
curl -s $IDX/health      # 200 when running
curl -s $IDX/ready       # 200 when historical sync done
curl -s $IDX/stats
curl -s "$IDX/tokens?filter=trending&limit=5"
# GraphQL:
curl -s $IDX/graphql -H 'content-type: application/json' \
  -d '{"query":"{ _meta { status } }"}'
```
REST endpoints: `/tokens /token/:addr /candles /trades /holders /portfolio/:addr /top-users /stats` (+ `/health /ready /graphql`).

## 2. Wire indexer URL into Vercel + redeploy

```bash
cd frontend
printf '%s' "https://<cour-indexer-domain>" | npx vercel env add VITE_INDEXER_URL production
printf '%s' "https://<cour-indexer-domain>" | npx vercel env add VITE_INDEXER_URL preview
npx vercel deploy --prod --yes
# then confirm the token list from the indexer renders on cour.fun
```

`VITE_RPC_URL` is **already set** in Vercel production. `VITE_WC_PROJECT_ID` and
`VITE_PINATA_JWT` have no value available — add them the same way once you have
them (WalletConnect/Reown and Pinata). The UI degrades cleanly without them.

## 3. Monitor on Railway (separate service, same project)

`monitor/` has no Dockerfile — Railway's Nixpacks will build it from `package.json`
(`pnpm start` → `tsx src/index.ts`). It needs `MONITOR_RPC_URL` and the deployment
addresses file. Because the service is just `monitor/`, point it at the addresses
via env, or deploy from the repo root so `../deployments/4663.json` resolves.

```bash
cd monitor
export RAILWAY_TOKEN=<token>
npx -y @railway/cli link                            # link to the cour-indexer project
npx -y @railway/cli service create cour-monitor     # or: add a new service in the project
MON_RPC=$(grep '^RH_RPC_URL=' ../.env | cut -d= -f2-)
npx -y @railway/cli variables --set "MONITOR_RPC_URL=$MON_RPC" --service cour-monitor
# Telegram (optional — if omitted the monitor logs alerts to stdout only):
# npx -y @railway/cli variables --set "TELEGRAM_BOT_TOKEN=<bot token>" --service cour-monitor
# npx -y @railway/cli variables --set "TELEGRAM_CHAT_ID=<chat id>" --service cour-monitor
npx -y @railway/cli up --service cour-monitor --detach
```

> Addresses: the monitor loads `../deployments/4663.json` by default. If the
> service root is `monitor/` only, set `DEPLOYMENT_FILE` to a path you include in
> the deploy, or deploy with the repo root as the service root and
> `DEPLOYMENT_FILE=deployments/4663.json`.

### Create a Telegram bot (optional alerts)

1. In Telegram, message **@BotFather** → `/newbot` → follow prompts → copy the
   **bot token** (`123456:ABC...`).
2. Start a chat with your new bot (send any message), or add it to a group.
3. Get the **chat id**: open
   `https://api.telegram.org/bot<token>/getUpdates` and read `result[].message.chat.id`
   (for a group it's negative, e.g. `-100...`).
4. Set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` as above and redeploy the monitor.

Without these two vars the monitor runs in **log-only** mode (alerts to stdout,
visible in `railway logs`).

## 4. Safe 2-of-3 + 48h Timelock handover (LAST — do after the above)

Blocked until you add three **distinct** owner addresses (none equal to the
deployer `0x1eb2…030b`) to `.env`:

```
OWNER_1=0x...
OWNER_2=0x...
OWNER_3=0x...
```

Then (full runbook: `docs/HANDOVER.md`):

```bash
# 1) Deploy the 2-of-3 Safe
forge script script/07_DeploySafe.s.sol --rpc-url "$RH_RPC_URL" --broadcast
#    → set MULTISIG=<safe address> in .env
# 2) Deploy Timelock (48h) + transfer ownership to it
forge script script/04_HandOver.s.sol --rpc-url "$RH_RPC_URL" --broadcast
#    → set TIMELOCK=<timelock address> in .env
# 3) Build the Safe Transaction-Builder JSONs (schedule + execute acceptOwnership)
forge script script/08_SafeHandoverTxs.s.sol
```

Import the **schedule** JSON into the Safe (sign 2-of-3) **now**; wait **48 h**;
import the **execute** JSON and sign 2-of-3. Then
`bash script/verify_handover.sh` must show `owner()==Timelock` and the deployer
powerless. Only after that: remove `DEPLOYER_PK` from `.env`.

> `setLaunchAllowlistEnabled(false)` is the very last action, via Safe→Timelock,
> only after indexer, env, audit and legal sign-off (see `docs/REPORT_GOLIVE.md §7`).
