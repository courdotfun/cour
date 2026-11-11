# Frontend environment variables (Vercel project `cour1/frontend`)

Vite inlines `import.meta.env.VITE_*` at **build time**, so after changing any var
you must **redeploy** (`vercel --prod`). Current status:

| Var | Status | Purpose | If empty (UI behaviour — always clean, never an error) |
|---|---|---|---|
| `VITE_RPC_URL` | ✅ set (production) | JSON-RPC for chain 4663 reads/writes | falls back to the public RPC default; on-chain reads still work |
| `VITE_INDEXER_URL` | ⬜ not set | indexer REST base (token lists, candles, portfolio) | **on-chain reads only** — shows the live CSMOKE token + honest empty states; no fabricated data |
| `VITE_WC_PROJECT_ID` | ⬜ not set | WalletConnect (mobile wallets) | WalletConnect disabled; **injected/EIP-6963 wallets (MetaMask etc.) still connect** |
| `VITE_PINATA_JWT` | ⬜ not set | IPFS image upload on launch | launch image upload shows a clear message ("Image upload unavailable: VITE_PINATA_JWT is not set"); launching without an image still works |

All empty-states are handled in code (no crashes): `data/indexer.ts` returns typed
`{ok:false}` results, `chain/wallet.ts` discovers injected wallets, and
`features/launch.ts` throws a readable error only when you actually try to upload.

## How to get the missing values

- **`VITE_INDEXER_URL`** — deploy the indexer first (see `docs/INDEXER_HOSTING.md`),
  then use its public URL (e.g. `https://cour-indexer.up.railway.app`).
- **`VITE_WC_PROJECT_ID`** — free project id from **https://cloud.reown.com**
  (formerly WalletConnect Cloud): create a project → copy the Project ID.
- **`VITE_PINATA_JWT`** — **https://pinata.cloud** → API Keys → create a key with
  `pinFileToIPFS` scope → copy the JWT.

## Set + redeploy

```bash
cd frontend
echo "https://<indexer-url>"      | npx vercel env add VITE_INDEXER_URL production --scope cour1
echo "<walletconnect-project-id>" | npx vercel env add VITE_WC_PROJECT_ID production --scope cour1
echo "<pinata-jwt>"               | npx vercel env add VITE_PINATA_JWT production --scope cour1
npx vercel --prod --scope cour1
```
