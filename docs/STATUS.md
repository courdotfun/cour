# STATUS COUR — Snapshot Program (Bahasa Indonesia)

> Tanggal: 2026-11-13 · Branch: `master` · Chain: Robinhood Chain (chainId **4663**)
> Deployment AKTIF = tag **`audit-freeze-v1`** (`deployments/4663.json`, block 106215255).
> Dokumen ini adalah ringkas-status tunggal: **yang selesai**, **yang belum**, dan **TODO manusia**.
> Sumber detail: `docs/REPORT.md`, `docs/GO_LIVE.md`, `docs/GO_LIVE_NEXT_STEPS.md`,
> `docs/REPORT_GOLIVE.md`, `docs/FRONTEND_CHANGES.md`, `docs/VERIFICATION.md`,
> `docs/audit/*`, `deployments/4663.json`.
>
> **2026-11-13:** `cour.fun` **LIVE** (fix outage; DNS+SSL; www→apex 308; smoke 0 error;
> 3 tema; WalletConnect; upload IPFS server-side). **Indexer + Monitor LIVE di Railway**
> (project "cour"). **Safe 2-of-3** ter-deploy + ownership **ditransfer ke Safe (opsi a,
> diinisiasi)** — tinggal Safe `acceptOwnership` 2-of-3. Sisa tugas user: accept
> ownership, (nanti) Timelock 48h sebelum publik, top-up gas deployer. Detail:
> `docs/HANDOVER.md`, `docs/REPORT_GOLIVE.md`.

---

## RINGKAS SATU LAYAR

| Area | Status | Catatan singkat |
|---|---|---|
| Kontrak Fase 1 (src/) | ✅ **BEKU & final** | tag `audit-freeze-v1`, 107 test hijau, coverage baris 96,3% |
| Deploy mainnet (4663) | ✅ **Live (tertutup)** | 7 kontrak, allowlist AKTIF, owner = EOA deployer |
| Verifikasi explorer | 🟡 **Sebagian** | robin.etherscan.io ✅ 7/7; Blockscout ⏳ (manual) |
| Indexer (Ponder) | 🟡 **Siap deploy; BLOKIR `RAILWAY_TOKEN`** | CLI token-based siap (`docs/GO_LIVE_NEXT_STEPS.md`); RPC pakai `RH_RPC_URL`; Postgres plugin |
| Monitor | 🟡 **Siap deploy; BLOKIR `RAILWAY_TOKEN`** | service terpisah; Telegram opsional (log-only bila kosong); `docs/GO_LIVE_NEXT_STEPS.md` |
| Frontend | ✅ **LIVE di https://cour.fun** | outage 500 diperbaiki; WalletConnect live; upload IPFS server-side (JWT tak ke client); smoke 0 error, 3 tema, invite-only gate |
| Pinata upload | ✅ **server-side (`api/upload.ts`)** | JWT server-only; magic-byte+2MB+rate-limit; tes nyata CID OK; 0 secret di dist/ |
| WalletConnect | ✅ **live di modal connect** | `VITE_WC_PROJECT_ID` set; TODO: allowed domains di dashboard Reown |
| Indexer (Railway) | ✅ **LIVE, backfilling** | `indexer-production-f5ef70d7.up.railway.app` + Postgres; /health 200, /ready 503 sampai backfill (106215255→head) selesai |
| Monitor (Railway) | ✅ **LIVE (log-only)** | `monitor-production-8079dfd3.up.railway.app`; watching factory/vault/router/hook; Telegram kosong → console |
| Indexer URL di frontend | 🟡 **belum** | `VITE_INDEXER_URL` diisi setelah indexer Railway up |
| Review keamanan | 🟡 **Internal review SELESAI (bukan audit independen)** | review internal tim COUR; audit pihak ketiga **masih direkomendasikan** sebelum buka publik |
| Handover multisig/timelock | 🟡 **Opsi (a): transfer ke Safe DIINISIASI** | `pendingOwner`=Safe `0xDca6…7fA2` di 4 kontrak; `owner()` masih deployer sampai Safe accept 2-of-3 (`deployments/safe-accept-ownership.json`). Timelock 48h nanti sebelum publik |
| Deployer | ✅ **Top-up 0.02 ETH; key di hardware wallet** | siap untuk op admin (handover) |
| Domain cour.fun | ✅ **LIVE + SSL aktif** | DNS `A @ 76.76.21.21` + `CNAME www` aktif; production 200; www→apex 308 |
| Legal / geo-block | 🟡 **Teknis siap, legal belum** | middleware + daftar negara ada; perlu review hukum |

**Keputusan inti:** allowlist launch **tetap AKTIF** (hanya deployer yang bisa launch) sampai
audit bersih + handover selesai. Semua yang ditandai **BLOKIR** di bawah harus kelar sebelum
`setLaunchAllowlistEnabled(false)` (buka publik).

---

## 1. YANG SUDAH SELESAI (dengan bukti)

### 1.1 Kontrak (Fase 1) — ✅ final & beku
- Tag beku: **`audit-freeze-v1`** (sourceCommit `458c358`). `git diff audit-freeze-v1 HEAD -- src script` = kosong.
- **107 test hijau** (103 non-fork + 4 fork mainnet). Profil `ci` (10k fuzz, invariant 32.416 panggilan) lulus.
- Coverage: **baris src 96,3%** (≥95% ✔), branch ~65% (target 80% belum — didokumentasikan jujur di `docs/REPORT.md §3`).
- Slither: 103 temuan, **tanpa High/Medium** (`docs/slither-report.txt`), semua dibantah per file:line.
- Fuzz stateful (medusa): 11/11 properti PASSED, 0 violation; campaign 25,2M panggilan (`docs/audit/`).
- Perbaikan review manusia C-1/L-1/I-1 + L-2/L-3/L-4 semua di-commit per poin (lihat `git log`).
- **Bukti:** `test/integration/LaunchToGraduation.t.sol`, `test/fork/*`, `test/invariant/*`, `docs/REPORT.md §1–3`.

### 1.2 Deploy mainnet final (4663) — ✅ live (tertutup)
Alamat AKTIF (tag `audit-freeze-v1`, block 106215255):

| Kontrak | Alamat |
|---|---|
| COURFactory | `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C` |
| COURFeeVault | `0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76` |
| COURHook | `0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC` |
| COURRouter | `0x835Afd54F9BA20b18b6807B44886123E85A586f9` |
| COURPriceReader | `0xF7C914E7B7580a7653DcC3b7574bf041F615e359` |
| COURCurve (impl) | `0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00` |
| GraduationImpl | `0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7` |

- Param produksi: startMc **$4000**, gradMc **$60000**, minBuybackUsd **50**, launchFee **0**, allowlist **AKTIF**.
- Dua deployment lama **di-pause & DEPRECATED** (`deployments/4663-DEPRECATED.json`).
- Smoke mainnet penuh sukses (swap→launch→graduasi positionId on-chain→buyback-burn→claim): `docs/MAINNET_SMOKE_RESULT.md`.
- **Bukti:** `deployments/4663.json`, commit `94d8a80`/`0e1faab`.

### 1.3 Verifikasi explorer — 🟡 sebagian
- **robin.etherscan.io: 7/7 kontrak VERIFIED** (`docs/VERIFICATION.md`), reproducible creation-bytecode sha256.
- **Blockscout: ⏳ belum** (di balik Cloudflare; std-json siap di `deployments/verify-blockscout/*.standard.json`). → TODO §3.5.
- **Bukti:** `docs/VERIFICATION.md`, `deployments/verify-4663.sh`.

### 1.4 Indexer (Ponder 0.18.4) — 🟡 siap, belum di-host
- Events → Postgres (pglite dev) + GraphQL + REST (`/tokens /token/:addr /candles /trades /holders /portfolio/:addr /top-users /stats`).
- Terbukti **live-index token uji CSMOKE** dari block 106215255; typecheck lulus; REST+GraphQL valid.
- Dockerfile + compose siap (Docker tak tersedia di mesin dev → image belum di-build).
- **Belum:** hosting produksi + Postgres terkelola + RPC khusus (RPC publik rate-limit 429 saat backfill). → TODO §3.6.
- **Bukti:** commit `6290391`, `docs/REPORT.md §3`.

### 1.5 Monitor — ✅ jalan (lokal)
- Watcher event + health (harga/saldo/paused/owner) → Telegram (fallback console) + `/status` + `/health`.
- `tsc` lulus; smoke live mainnet jalan (baca NVDA ~$201). Handover+pause **teruji di fork** (`test/fork/HandoverAndPause.t.sol`, 2/2 PASS).
- **Belum:** host 24/7 + token Telegram prod. **Bukti:** commit `7336e54`, `docs/INCIDENT_RUNBOOK.md`.

### 1.6 Frontend — 🟡 sebagian (lihat §2 untuk gap rinci)
- Desain `COUR-launchpad.html` dipindah ke app nyata (Vite+TS+viem) di `frontend/`; visual dipertahankan (30 screenshot, 5 view × 3 tema × 2 viewport, 0 error konsol; `pnpm build` PASS).
- **Sudah tersambung nyata:** wallet EIP-6963, allowlist gating tombol Launch, admin panel owner-only (claimPlatform), lapisan data indexer REST + fallback on-chain, modul fitur (buy/sell/buyWithETH, createToken, claim/holder/platform, buyback, stock swap) di `window.COUR.features`, seeding harga nyata (simulator dimatikan via `COUR_LIVE`).
- Edit kejujuran (LP 0% + LP dibakar, limit order → Coming soon, "pay with any token" → ETH/stock) selesai: `docs/FRONTEND_CHANGES.md`.
- **Bukti:** commit `84e9bc3`, `docs/FRONTEND_CHANGES.md`.

---

## 2. YANG BELUM SELESAI (gap jujur)

### 2.1 Frontend — gap utama (prioritas kerja saat ini)
Render DOM **legacy demo** masih dipakai di beberapa jalur; data nyata sudah ada di `window.COUR`
tapi renderer spesifik belum di-swap (butuh bongkar skrip inline ~8,5k baris):

1. **Daftar market home / token card** masih iterasi array `tokens` hard-coded, bukan `/tokens` indexer.
2. **Saldo wallet/portfolio** masih baca `_holdings` / `W.stocks`, bukan `/portfolio/:addr` + `balanceOf` on-chain.
3. **Chart candle token-page** masih render buffer in-memory, bukan `/candles`.
4. **Handler form** `ordSubmit` (buy/sell) & `ctLaunch` (launch) masih jalur demo; padanan nyata ada di `window.COUR.features` tapi belum di-wire ke tombol.

> Catatan: di mode live (`COUR_LIVE=true`) simulator harga/fee **dimatikan**, jadi tidak ada angka
> yang difabrikasi; tapi render di atas belum menampilkan data nyata (menampilkan nilai terakhir/empty).

**Status terkini (diperbarui 2026-11-11):**
- **Wiring data nyata: SELESAI** — gap 1–4 ditutup via seam + driver `src/live/`
  (lihat `docs/FRONTEND_CHANGES.md §7`). Demo `tokens` array dihapus; home/token/
  portfolio/candle/buy/sell/launch pakai data nyata.
- **E2E Playwright UI: 5/5 HIJAU** (deterministik, fixture indexer, system Chrome):
  home render token nyata (demo hilang), token page harga + candle nyata, connect
  EIP-6963, portfolio data layer. Lihat `frontend/e2e/`.
- **E2E on-chain penuh (fork)**: spec siap & env-gated (`e2e/fork.spec.ts` +
  `fork-setup.mjs`) tapi **belum dijalankan di sini** (butuh anvil fork 4663 +
  akun terdana). Alur kontraknya sudah hijau di `test/fork/*`.
- **Lighthouse: diukur** — Accessibility **90**, Best-Practices **96** (≥85 ✓),
  SEO 75, **Performance 42 (✗, di bawah 85)**. Penyebab: desain `index.html`
  monolitik ~1,16 MB (inline script 8,5k baris + CSS + gambar base64). Naik ke ≥85
  butuh refactor struktur (code-split, externalize gambar) — **follow-up**.
- **Deploy Vercel: SUDAH (2026-11-11)** — project `cour1/frontend` live & `READY`
  di `https://frontend-lemon-mu-g0mh4l8zez.vercel.app` (deploy pertama otomatis jadi
  production oleh Vercel; domain `*.vercel.app`, belum domain kustom). Build `pnpm build`
  lulus di Vercel. Baked env: `VITE_RPC_URL`=RPC Robinhood. **Masih perlu diisi di
  Project Settings:** `VITE_INDEXER_URL` (saat indexer sudah di-host → list token penuh;
  sekarang fallback on-chain CSMOKE), `VITE_WC_PROJECT_ID`, `VITE_PINATA_JWT`, lalu
  redeploy + domain kustom. Geo-block middleware aktif (blokir US). Lihat §3.7.
- **Smoke matrix 5×3×2**: logika ada + diperketat (abaikan noise jaringan), tapi
  lambat di sandbox ini (30 screenshot halaman 1,16 MB); E2E sudah membuktikan 0 error JS.

### 2.2 Review keamanan — 🟡 internal review SELESAI, audit independen BELUM
**Internal review tim COUR SELESAI (2026-11-11)** — ini review internal, **bukan audit
pihak ketiga independen**. Audit independen **masih direkomendasikan** sebelum buka publik
atau sebelum kontrak memegang nilai signifikan. Paket audit siap bila ingin engage firma
(`docs/AUDIT_SCOPE.md`, `docs/AUDITOR_BRIEF.md`, `docs/audit/*`). Lihat `docs/RISKS.md`.

### 2.3 Handover ownership — 🟡 sedang dikerjakan
Owner semua kontrak masih **EOA deployer** untuk saat ini. Safe v1.4.1 kanonik **sudah ada
di 4663** → Safe 2-of-3 + Timelock 48h sedang disiapkan (butuh 3 owner dari kamu). Lihat `docs/HANDOVER.md`.
Private key deployer **sudah di-backup ke hardware wallet**; copy `.env` dihapus setelah handover terbukti.

### 2.4 Operasional / infra
- Indexer deploy ke Railway sedang disiapkan; monitor belum di-host 24/7.
- Saldo deployer: **sudah di-top-up 0.02 ETH** — cukup untuk op admin (handover).
- Legal review (US persons/sekuritas) belum; daftar geo-block (`frontend/src/config/regions.ts`, saat ini hanya `["US"]`) perlu konfirmasi hukum.

---

## 3. TODO MANUSIA (urut, konkret, dengan perintah/link & perkiraan biaya)

> Tanda **[BLOKIR]** = wajib sebelum buka allowlist publik. **[OPS]** = operasional/boleh menyusul.
> Gas di 4663 sangat murah (~0.0005 ETH/op). "~$" asumsi ETH; sesuaikan.

### 3.1 [✅ SELESAI] Top-up saldo deployer
- **Status: SELESAI** — deployer `0x1eb25d02fc7C5487D4648a602c355dBC2301030b` di-top-up **0.02 ETH** (chain 4663).
- **Cek saldo:** `cast balance 0x1eb25d02fc7C5487D4648a602c355dBC2301030b --rpc-url https://rpc.mainnet.chain.robinhood.com --ether`

### 3.2 [🟡 Internal review SELESAI — audit independen direkomendasikan] Review keamanan
- **Status:** internal review tim COUR **SELESAI** (bukan audit independen). Audit pihak ketiga **masih direkomendasikan** sebelum buka publik.
- **Kirim ke siapa (opsi bila ingin audit independen — pilih sesuai bujet/antrean):**
  - **Tier-1 (mahal, antre lama):** Trail of Bits, OpenZeppelin, Spearbit/Cantina — perkiraan **$30k–$80k+**, 2–6 minggu.
  - **Tier-2/boutique:** Zellic, Cyfrin, Guardian, Sigma Prime, ABDK, Dedaub — perkiraan **$15k–$40k**.
  - **Contest/crowdsourced:** Code4rena, Sherlock, Cantina Competitions — **$10k–$50k** pot, cakupan luas tapi perlu triase.
  - **Solo/independent (lebih murah):** mis. via Cantina marketplace / warden independen — **$3k–$15k**.
- **Apa yang dikirim:** tag `audit-freeze-v1` + `docs/AUDITOR_BRIEF.md` + `docs/audit/HUMAN_AUDIT_PACKAGE.md` + `docs/AUDIT_SCOPE.md` + alamat live (§1.2) + `docs/audit/OUTREACH_EMAIL.md`.
- **Scope:** `src/` (Factory, FeeVault, Hook, Router, Curve, PriceReader, GraduationImpl, Token, libraries). Fokus: graduasi/konservasi token, buyback guard, HOLDERS dividend, integrasi v4 hook + v3 oracle.
- **Setelah selesai:** bila ada temuan → `docs/audit/POST_AUDIT_PLAYBOOK.md` → `audit-fix-v1` + redeploy; bila bersih → lanjut handover.

### 3.3 [✅ Backup SELESAI — hapus `.env` setelah handover] Amankan private key deployer
- **Status: SELESAI (backup)** — key deployer sudah di-backup ke hardware wallet.
- **Sisa:** **hapus `DEPLOYER_PK` dari `.env` lokal** segera setelah handover ke Timelock terbukti on-chain (`docs/HANDOVER.md`). Sampai handover selesai, key masih dipakai untuk 1× menjalankan `04_HandOver`.

### 3.4 [BLOKIR] Safe 2-of-3 di 4663 → handover ke Timelock 48 jam
- **Buat Safe:** via `app.safe.global` bila 4663 didukung; jika tidak, deploy Safe singleton+factory sendiri atau pakai `safe-cli`. Minimal **2-of-3 signer**. Biaya self-deploy ~**0.001 ETH**.
- **Set `MULTISIG`** di `.env`.
- **Handover (transfer factory/priceReader/feeVault/router → Timelock 48h):**
  ```
  export MULTISIG=<alamat Safe>
  forge script script/04_HandOver.s.sol:HandOver --rpc-url $RH_RPC_URL --broadcast --slow
  # lalu Timelock acceptOwnership() tiap kontrak via op multisig terjadwal (48 jam).
  ```
- **Biaya:** ~0.0005 ETH + 4× acceptOwnership. **Selesai bila:** `owner()` tiap kontrak == Timelock; multisig = proposer/executor.

### 3.5 [OPS] Verifikasi Blockscout (manual)
- **File:** `deployments/verify-blockscout/*.standard.json` (std-json input per kontrak) + constructor args di `deployments/verify-4663.sh`.
- **Langkah:** buka Blockscout 4663 → tiap alamat (§1.2) → **Verify & Publish** → **Standard JSON Input** → upload file `*.standard.json` yang sesuai → isi constructor args dari `verify-4663.sh` → compiler `0.8.26`, viaIR true, optimizer runs `44444444`, evm `cancun`.
- **Biaya:** ~0. **Selesai bila:** 7/7 "verified" di Blockscout (etherscan sudah ✅).

### 3.6 [BLOKIR-publik] Host indexer (Railway/Render/Fly) + env
- **Pilih host** (opsi): **Railway** (paling cepat, Postgres add-on) / **Render** (web service + Postgres) / **Fly.io** (Docker, global).
- **Butuh:** Postgres terkelola + **RPC khusus 4663** (RPC publik kena 429 saat backfill).
- **Env indexer:** `PONDER_RPC_URL_4663=<rpc khusus>`, `DATABASE_URL=<postgres>`, `PONDER_START_BLOCK=106215255`.
- **Deploy:** `cd indexer && pnpm install && pnpm start` (prod) atau build image `indexer/Dockerfile` + `docker compose`.
- **Selesai bila:** endpoint REST publik (mis. `https://indexer.cour.xxx`) menyajikan `/tokens`, `/stats`, dst. → dipakai `VITE_INDEXER_URL` frontend.

### 3.7 [BLOKIR-publik] Vercel login + deploy + domain + env frontend
- **Login & deploy:**
  ```
  cd frontend
  npx vercel login            # (interaktif — jalankan di terminal Anda; di sesi ini pakai: ! npx vercel login)
  npx vercel                  # preview
  npx vercel --prod           # produksi
  ```
- **Env (Vercel Project Settings → Environment Variables):**
  - `VITE_RPC_URL` = `https://rpc.mainnet.chain.robinhood.com` (atau RPC khusus)
  - `VITE_INDEXER_URL` = URL indexer dari §3.6
  - `VITE_WC_PROJECT_ID` = project id WalletConnect (dari cloud.walletconnect.com, gratis)
  - `VITE_PINATA_JWT` = JWT Pinata untuk upload metadata/gambar IPFS (dari pinata.cloud)
- **Domain:** tambah domain kustom di Vercel + set DNS. **Biaya:** Vercel hobby gratis; domain ~$10–15/thn.
- **Selesai bila:** URL publik frontend live, konek wallet 4663, baca data dari indexer.

### 3.8 [BLOKIR] Review legal + daftar negara geo-block
- **Apa:** nasihat hukum soal token saham Robinhood (larangan US persons/sekuritas), ToS, disclaimer.
- **Konfigurasi:** `frontend/src/config/regions.ts` (`BLOCKED_COUNTRIES`, saat ini `["US"]`) + `frontend/middleware.ts` (edge geo-block, HTTP 451).
- **Selesai bila:** daftar negara dikonfirmasi pengacara; disclaimer siap.

### 3.9 [BLOKIR — LANGKAH TERAKHIR] Buka allowlist publik
- **Prasyarat:** 3.2 (audit bersih), 3.3 (key aman), 3.4 (handover), 3.6+3.7 (indexer+frontend live), 3.8 (legal), monitoring live.
- **Lewat `docs/audit/POST_AUDIT_PLAYBOOK.md`**, ajukan via multisig ke Timelock, eksekusi setelah 48 jam:
  ```
  factory.setLaunchAllowlistEnabled(false)
  ```
- **Selesai bila:** `launchAllowlistEnabled() == false`; peluncuran publik pertama sukses & termonitor.

### Yang MEMBLOKIR peluncuran publik (ringkas)
**3.2 Audit · 3.3 Amankan key · 3.4 Handover multisig/timelock · 3.6 Host indexer · 3.7 Deploy frontend · 3.8 Legal.**
(3.1 top-up & 3.5 Blockscout bukan pemblokir mutlak tapi praktis diperlukan lebih dulu.)

---

## 4. Referensi perintah cepat
```
# saldo deployer
cast balance 0x1eb25d02fc7C5487D4648a602c355dBC2301030b --rpc-url https://rpc.mainnet.chain.robinhood.com --ether
# verifikasi handover+pause di fork (tanpa dana)
forge test --match-path 'test/fork/HandoverAndPause.t.sol' -vv
# indexer / frontend / monitor (lokal)
cd indexer && pnpm install && pnpm dev
cd frontend && pnpm install && pnpm build && pnpm dev
cd monitor && pnpm install && pnpm start
```
Sumber lengkap: `docs/GO_LIVE.md` (urutan go-live), `docs/REPORT.md` (laporan program), `docs/audit/` (paket audit).
