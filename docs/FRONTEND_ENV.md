# Frontend environment variables (Vercel project `cour1/frontend`)

Vite inlines `import.meta.env.VITE_*` at **build time**, so after changing any
`VITE_*` var you must **redeploy** (`vercel deploy --prod`). Server env vars
(no `VITE_` prefix) are read at runtime by serverless/edge functions.

Status as of **2026-11-13**:

| Var | Scope | Status | Purpose | If empty (UI stays clean, never errors) |
|---|---|---|---|---|
| `VITE_RPC_URL` | client (build) | ✅ Production | JSON-RPC for chain 4663 reads/writes | falls back to the public RPC default |
| `VITE_WC_PROJECT_ID` | client (build) | ✅ Production + Preview | WalletConnect (QR / mobile wallets) | WalletConnect option hidden; injected/EIP-6963 wallets still connect |
| `PINATA_JWT` | **server** (runtime) | ✅ Production + Preview | IPFS upload via `api/upload.ts` (JWT never reaches the browser) | `/api/upload` returns a clean 500 "upload_unavailable"; launching without an image still works |
| `VITE_INDEXER_URL` | client (build) | ⬜ not set | indexer REST/GraphQL base (token lists, candles, trades, holders, portfolio) | **on-chain reads only** — live CSMOKE token + honest empty states; no fabricated data |
| ~~`VITE_PINATA_JWT`~~ | — | ❌ **removed** | (was client-side Pinata JWT) | replaced by the server-side `PINATA_JWT` + `api/upload.ts` — do **not** reintroduce |

> **Security note:** the Pinata JWT is now a **server-only** var (`PINATA_JWT`, no
> `VITE_` prefix) consumed by the Edge function `frontend/api/upload.ts`. It is
> never bundled into the client. Verified: the exact JWT value appears in **0**
> files under `dist/` and no JWT-shaped token is present. See
> `docs/FRONTEND_CHANGES.md` for the upload-hardening details (2 MB cap, magic-byte
> type check, per-IP rate limit).

All empty-states are handled in code (no crashes): `data/indexer.ts` returns typed
`{ok:false}` results, `chain/wallet.ts` discovers injected wallets + lazy-loads
WalletConnect, and the launch flow degrades to no-image if `/api/upload` fails.

## How to get / set the remaining values

- **`VITE_INDEXER_URL`** — deploy the indexer first (see
  `docs/INDEXER_HOSTING.md` / `docs/GO_LIVE_NEXT_STEPS.md`), then use its public
  Railway URL. Set for production **and** preview, then redeploy.
- **WalletConnect dashboard** — add `cour.fun` and `www.cour.fun` to the project's
  **allowed domains / verified domains** at https://cloud.reown.com so WC pairing
  and verification work from production.

```bash
cd frontend
printf '%s' "https://<indexer-url>" | vercel env add VITE_INDEXER_URL production
printf '%s' "https://<indexer-url>" | vercel env add VITE_INDEXER_URL preview
vercel deploy --prod --yes
```
