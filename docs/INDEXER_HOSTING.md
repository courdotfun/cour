# Indexer hosting — Railway (COUR Ponder indexer)

The indexer (`indexer/`, Ponder 0.18.4) reads COUR events from chain 4663 into
Postgres and serves GraphQL + REST (`/tokens /token/:addr /candles /trades
/holders /portfolio/:addr /top-users /stats`, plus Ponder `/health` + `/ready`).

Deploy files are ready in `indexer/`: **`Dockerfile`**, **`railway.json`**
(Dockerfile builder, start `ponder start --schema public --hostname 0.0.0.0 --port $PORT`,
healthcheck `/health`), **`.dockerignore`**.

## Prerequisites you provide

1. **Railway account** + login (browser): `railway login`.
2. A **dedicated RPC URL for chain 4663**. The public RPC
   (`https://rpc.mainnet.chain.robinhood.com`) rate-limits (HTTP 429) during the
   historical backfill — use a dedicated/paid endpoint for `PONDER_RPC_URL_4663`.

## Option A — Railway CLI (from `indexer/`)

```bash
cd indexer
railway login                     # browser auth
railway init                      # create a new project (or `railway link` to an existing one)
railway add --database postgres   # adds Postgres → injects DATABASE_URL
railway variables --set "PONDER_RPC_URL_4663=<your dedicated 4663 RPC>"
railway up                        # builds the Dockerfile and deploys
railway domain                    # generate a public URL (e.g. https://cour-indexer.up.railway.app)
```

Ponder reads `DATABASE_URL` (from the Postgres plugin) automatically and starts the
indexer + HTTP server. Start block is pinned in `src/addresses.ts`
(`START_BLOCK = 106215255`, matching `deployments/4663.json`).

## Option B — Railway dashboard (GitHub)

1. New Project → Deploy from GitHub repo → pick `courdotfun/cour`, **root directory
   `indexer`**. Railway detects `railway.json` + `Dockerfile`.
2. Add a **Postgres** database to the project (gives `DATABASE_URL`).
3. Variables → add `PONDER_RPC_URL_4663 = <dedicated 4663 RPC>`.
4. Deploy. Under Settings → Networking, **Generate Domain** for a public URL.

## Env summary

| Var | Source | Value |
|---|---|---|
| `DATABASE_URL` | Railway Postgres plugin | auto-injected |
| `PONDER_RPC_URL_4663` | you | dedicated 4663 RPC (not the rate-limited public one) |
| `PORT` | Railway | auto (the start command binds `$PORT`) |

## Verify after deploy

```bash
IDX=https://<your-railway-domain>
curl -s $IDX/health         # 200 once running
curl -s $IDX/ready          # 200 once historical sync is complete (backfill done)
curl -s $IDX/stats          # { totalTokens, totalGraduated, ... }
curl -s "$IDX/tokens?filter=trending&limit=5"
curl -s "$IDX/token/0x9662F473D5810aa832ed4282bCB0b0F3348fA7bC"   # CSMOKE
```

## Then wire the frontend

```bash
cd frontend
echo "https://<your-railway-domain>" | npx vercel env add VITE_INDEXER_URL production --scope cour1
npx vercel --prod --scope cour1            # redeploy so the build picks it up
```

> Until `VITE_INDEXER_URL` is set, the frontend uses on-chain reads only (shows the
> live CSMOKE token + any token you query), with honest empty states — never fake data.
