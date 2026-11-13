# Laporan Go-Live COUR (2026-11-11) — Bahasa Indonesia

> Sesi: handover multisig, hosting indexer, domain cour.fun, env frontend,
> optimasi performa, verifikasi. **Kontrak `src/` TETAP BEKU** (`audit-freeze-v1`),
> tidak ada deploy kontrak baru, allowlist **tetap AKTIF**. Private key tidak pernah dicetak.

---

## ⚡ Update 2026-11-14 (sesi 5) — Safe hardware-wallet, indexer auto-pool + USD snapshot

**1. Safe + hardware wallet (dua jalur, diuji fork).** Simulasi lama pakai raw-hash
(`--no-hash`) yang Ledger umumnya tolak. Sekarang:
- (a) **EIP-712 typed data** (disarankan): `script/safe/make-712.mjs` menulis JSON
  SafeTx (domain chainId 4663 + verifyingContract=Safe); owner tanda tangan
  `cast wallet sign --ledger --data --from-file script/safe/out/accept-712.json`
  (dipakai apa adanya, v=27/28).
- (b) **fallback eth_sign**: `cast wallet sign --ledger <safeTxHash>` (prefix),
  `exec.sh` auto-naikkan v jadi 31/32.
- `exec.sh` **mendeteksi** tipe tiap signature, verifikasi via `checkNSignatures`
  **dan** simulasi `execTransaction` (eth_call) SEBELUM broadcast; tolak kalau gagal.
  `accept-ownership.sh`/`pause.sh` cetak **dry-run** (hash, nonce, acceptOwnership×4)
  untuk dicocokkan dgn layar Ledger. Eksekutor = **owner #1** (saldo terbesar).
- Fork test `simulate.sh`: owner A pakai (a), owner B pakai (b), dalam SATU
  execTransaction → `owner()==Safe` di 4 kontrak ✅.

**2. Indexer pool otomatis (tanpa daftar statis).** `poolIds.ts` query event
`Graduated` saat startup (async config) → filter PoolManager. Graduasi baru saat
berjalan: handler `process.exit` → Railway restart → loader muat pool baru → re-sync
indeks swap-nya (di-gate `LOADER_OK` agar tak loop saat RPC error). *(Jalur hook-only
tak dipakai: FeeTaken tak punya amount in/out & StateView tak ter-deploy.)* Diuji:
loader mengembalikan 0 pool (belum ada graduasi), `/ready=200`. Catatan: E2E
graduasi penuh butuh $60k mcap — mekanika graduasi dicakup
`test/integration/LaunchToGraduation.t.sol`; handler PoolManager:Swap tak berubah.

**3. Indexer USD snapshot.** Block-interval poll (~60s, mulai dekat head) menyimpan
`stockUsd` tiap stock ke tabel `stockPrice`; trade/candle USD pakai **snapshot
terdekat** (bukan harga per-trade terkini). Backfill lama pakai harga terkini
(didokumentasikan). Diuji live: snapshot NVDA tiap 60 detik ($161.x).

---

## ⚡ Update 2026-11-14 (sesi 4) — indexer cepat, Safe tanpa UI, monitor owner

**1. Indexer dipercepat 116 jam → 4 detik** (tanpa ubah `src/` kontrak). Dua akar
masalah: (a) PoolManager di-index tanpa filter → Ponder ambil SELURUH swap v4
se-chain. Tambah topic-filter statis pada `id`/PoolId = poolId COUR
(`indexer/src/poolIds.ts`; 0 pool graduated → sentinel). (b) Handler baca state
historis via `context.client` → RPC publik NON-ARCHIVE tolak eth_call historis →
Ponder retry bermenit. Dialihkan ke `latestClient` (baca block latest;
config/name/symbol immutable = eksak; stockUsd cache 60s). Hasil `/ready=200`,
CSMOKE terindex. **RPC berbayar TIDAK wajib** (archive hanya untuk USD historis eksak).

**2. Safe accept ownership TANPA Safe UI** (app.safe.global tak dukung 4663).
Toolkit cast di `script/safe/`, divalidasi end-to-end di anvil fork (`simulate.sh`
→ owner()==Safe di 4 kontrak ✅): `accept-ownership.sh` (1 tx MultiSend + safeTxHash),
owner tanda tangan offline `cast wallet sign --ledger --no-hash <hash>` (v=27/28),
`exec.sh` (gabung 2 sig urut alamat + execTransaction), `pause.sh` (incident).
**safeTxHash accept (nonce 0): `0x50e1cbdcc3e4415524c4bde858850320f113c68209a5aa0bb1ecb54eaa2a6ed1`.**
Langkah copy-paste: `docs/HANDOVER.md`; pause: `docs/INCIDENT_RUNBOOK.md`.

**3. Monitor**: berhenti pantau saldo deployer; pantau saldo ETH 3 owner Safe
(ambang 0.001) + perubahan `owner()`/`pendingOwner()` di 4 kontrak. Live:
owner balances 0.037/0.0021/0.0020; pendingOwner=Safe. ⚠️ owner #2/#3 ~0.002 ETH.

---

## ⚡ Update 2026-11-13 — domain live + outage fixed + smoke passed

**Insiden ditemukan & diperbaiki:** `https://cour.fun` sedang **DOWN** (HTTP 500
`MIDDLEWARE_INVOCATION_FAILED`) di seluruh rute. Penyebab: Vercel menjalankan
`frontend/middleware.ts` di runtime **Node ESM**, dan impor tanpa ekstensi
`./src/config/regions` gagal (`ERR_MODULE_NOT_FOUND`). **Fix:** impor jadi
`./src/config/regions.js` (tsconfig `bundler` + `allowImportingTsExtensions`
menerima ini, satu sumber kebenaran untuk daftar geo-block tetap terjaga).
tsc hijau → redeploy production → `cour.fun` **200 OK**.

| Item | Status 2026-11-13 |
|---|---|
| DNS `cour.fun` → `76.76.21.21` | ✅ aktif (resolved) |
| DNS `www` → `cname.vercel-dns.com` | ✅ aktif |
| SSL / HTTPS + HSTS | ✅ aktif |
| Production di `cour.fun` | ✅ **200 OK** (setelah fix) |
| `www` → `cour.fun` redirect | ✅ 308 (host-redirect di `vercel.json`); root `/` sempat cache-HIT 200, bersih setelah revalidasi |
| Smoke desktop (1366×900) | ✅ 200, COUR boot, **0 error console** |
| Smoke mobile (iPhone 13) | ✅ 200, COUR boot, **0 error console** |
| 3 tema (classic / cartoon / light) | ✅ semua apply |
| Tombol launch "invite-only" (wallet non-allowlist) | ✅ "Launches are invite-only during beta", disabled (membuktikan baca allowlist on-chain hidup) |
| Geo-block middleware | ✅ ter-deploy & jalan (tak crash lagi); butuh request ber-geo US untuk picu 451 |

Alat smoke: `frontend/scripts/live-smoke.mjs` (screenshot di `frontend/screenshots/live-*.png`).

**Masih diblokir kredensial Anda** (langkah persis: `docs/GO_LIVE_NEXT_STEPS.md`):
indexer+monitor Railway butuh `RAILWAY_TOKEN`; Safe butuh `OWNER_1/2/3`;
`VITE_WC_PROJECT_ID`/`VITE_PINATA_JWT` tak tersedia nilainya. `VITE_RPC_URL` sudah
ter-set di Vercel. RPC indexer/monitor bisa pakai `RH_RPC_URL` yang sudah ada.

---

## ⚡ Update 2026-11-13 (sesi 2) — Pinata server-side, WalletConnect, Safe

Setelah kredensial diisi (`RAILWAY_TOKEN`, `VITE_WC_PROJECT_ID`, `PINATA_JWT`
server-side, `OWNER_1/2/3`):

**1. Pinata AMAN (upload server-side).** JWT dipindah ke server; tak pernah ke
browser. Fungsi Edge `frontend/api/upload.ts`: POST gambar (≤2 MB, tipe dicek via
**magic bytes** png/jpeg/webp/gif), rate-limit per IP (10/10 menit), atau POST JSON
metadata → `{cid,url}`; error rapi 400/405/413/415/429/500 tanpa bocor rahasia.
`VITE_PINATA_JWT` dihapus dari kode + `.env.example`. **Bukti:** nilai JWT muncul di
**0** file `dist/` (grep nilai persis = 0; tak ada token berbentuk `eyJ…`). **Tes
upload nyata:** gambar → CID `Qma6z76Xiyw9MPDJhZEWLbjquYEqLeWhzL7MAje5chAwBB`;
metadata → CID `QmdSrNVcNr2sHoqCo711hzq3TwmyQGaRNViaWAY6tABDCB`; PNG palsu → **415**.
Launch form kini `uploadImage → uploadMetadata → metadataURI = ipfs://<cid JSON>`.

**2. WalletConnect.** `@walletconnect/ethereum-provider` di-lazy-load & disambung ke
adapter + opsi "WalletConnect" di modal connect (QR/mobile) di samping wallet
injected. `VITE_WC_PROJECT_ID` di-set (production + preview). Smoke: opsi WC muncul,
klik → modal QR ter-mount. **TODO Anda:** tambah `cour.fun` + `www.cour.fun` ke
allowed domains di dashboard Reown (cloud.reown.com).

**3. Safe 2-of-3 (DEPLOY SAJA).** Safe v1.4.1 ter-deploy:
`MULTISIG=0xDca6d36E44E848a7C4088Fb5d12FfDEd22EA7fA2`. Verifikasi on-chain:
`getOwners()`=OWNER_1/2/3, `getThreshold()`=2, `VERSION()`="1.4.1". Owner EIP-55
valid, berbeda, bukan deployer. **Handover BELUM** dijalankan — menunggu pilihan
model pause darurat (lihat `HANDOVER.md` → "⚠️ DECISION NEEDED"; rekomendasi: opsi
(a) Safe jadi owner langsung saat beta, Timelock 48 jam sebelum publik).

**4. Indexer + Monitor (Railway) — MASIH TERBLOKIR.** `RAILWAY_TOKEN` yang diberikan
**tidak valid**: API Railway menolak sebagai account-token (`Not Authorized`) dan
project-token (`not found`), dan formatnya bukan token Railway. Perlu token baru yang
valid (Railway → Account/Project → Tokens). Runbook token-based siap di
`docs/GO_LIVE_NEXT_STEPS.md`. Catatan: RPC indexer/monitor pakai `RH_RPC_URL`; dari
Railway (cloud) endpoint itu normal — **di mesin lokal ini** host RPC di-hijack DNS
oleh ISP (Indosat/ioh.co.id), jadi deploy Safe tadi lewat proxy lokal ke IP asli.

---

## ⚡ Update 2026-11-13 (sesi 3) — Railway live + handover opsi (a)

Token Railway valid (`rlwy_wksp_…`, workspace token) + pilihan **opsi (a)** diterima.

**Indexer + Monitor LIVE di Railway** (project **"cour"**, via API + project-token
karena CLI menolak workspace token untuk perintah account-scoped):
- **Indexer:** `https://indexer-production-f5ef70d7.up.railway.app` (Ponder + Postgres).
  `/health`=200, `/status`/`/stats`/`/tokens`/`/graphql`=200. `/ready`=503 **sampai
  backfill selesai** (106215255→~113.5M block; lambat di RPC publik = risiko rate-limit
  terdokumentasi). Data token/chart/trades/holders muncul seiring sync.
- **Monitor:** `https://monitor-production-8079dfd3.up.railway.app` (log-only; Telegram
  kosong). Watching factory/vault/router/hook; `/health`+`/status`=200;
  `allowlistEnabled=true`, `launchesPaused=false`. ⚠️ alert: **saldo ETH deployer rendah
  0.0215** (<0.05) — top-up untuk op admin mendatang.
- Perbaikan deploy: Dockerfile indexer (hapus cache-mount yang ditolak Railway; start
  bind `0.0.0.0:$PORT --schema public`); hapus `monitor/pnpm-workspace.yaml` (bikin
  `--frozen-lockfile` gagal); monitor baca alamat dari `deployment-4663.json`.
- **`VITE_INDEXER_URL`** di-set (prod+preview) + frontend redeploy ke cour.fun.

**Safe handover — OPSI (a) DIINISIASI.** Ownership factory/priceReader/feeVault/router
di-`transferOwnership(Safe)` (`09_TransferOwnershipToSafe`, Ownable2Step). On-chain:
`pendingOwner`=Safe di keempatnya; `owner()` masih deployer sampai Safe **accept 2-of-3**.
File tanda tangan: **`deployments/safe-accept-ownership.json`** (4× `acceptOwnership()`).
Timelock 48 jam **ditunda** sampai sebelum `setLaunchAllowlistEnabled(false)`.

**Yang harus Anda lakukan:** (1) import `safe-accept-ownership.json` ke Safe, tanda
tangan 2-of-3 → `owner()`=Safe (respons insiden instan aktif); (2) top-up ETH deployer;
(3) **rotasi `RAILWAY_TOKEN`** (ter-paste di chat); (4) nanti sebelum publik: `04_HandOver`
(Timelock 48h). Backfill indexer berjalan sendiri.

---

## 1. Status Handover (Safe + Timelock)

| Item | Status |
|---|---|
| Safe v1.4.1 kanonik di 4663 | ✅ **ADA** (SafeProxyFactory `0x4e1D…ec67`, SafeL2 `0x29fc…C762`, fallback `0xfd07…Ec99`) — verified on-chain |
| Script deploy Safe 2-of-3 | ✅ siap (`script/07_DeploySafe.s.sol`) — **butuh OWNER_1/2/3 dari Anda** |
| Alamat Safe (MULTISIG) | ⬜ belum (menunggu owner) |
| 04_HandOver (Timelock 48h) | ⬜ belum (jalan setelah MULTISIG ada) |
| Timelock address | ⬜ belum |
| Safe tx JSON (schedule/execute acceptOwnership) | ✅ generator siap (`script/08_SafeHandoverTxs.s.sol`) |
| Bukti owner()==Timelock + deployer powerless | ✅ script siap (`script/verify_handover.sh`) |
| owner() tiap kontrak saat ini | **deployer EOA** `0x1eb2…030b` (belum pindah) |

Runbook lengkap: **`docs/HANDOVER.md`**. Owner EOA kini sudah di-backup ke hardware
wallet; `DEPLOYER_PK` dihapus dari `.env` **setelah** handover terbukti.

## 2. Indexer (Railway)

| Item | Status |
|---|---|
| Dockerfile + `railway.json` + `.dockerignore` | ✅ siap di `indexer/` |
| Panduan deploy | ✅ `docs/INDEXER_HOSTING.md` |
| Deploy aktual | ⬜ **butuh `railway login` (browser) dari Anda** — CLI belum terautentikasi |
| URL indexer | ⬜ belum |
| `VITE_INDEXER_URL` di Vercel | ⬜ belum (diisi setelah URL ada) |

Catatan: butuh **RPC khusus 4663** (RPC publik kena 429 saat backfill) + Postgres
(plugin Railway → `DATABASE_URL` otomatis). Start block `106215255` sudah dipin di kode.

## 3. Domain cour.fun + SSL

| Item | Status |
|---|---|
| cour.fun + www.cour.fun ditambahkan ke project Vercel | ✅ |
| Production di-alias ke cour.fun | ✅ (sisi Vercel) |
| DNS | ⬜ **butuh Anda set** → `A @ 76.76.21.21` + `CNAME www cname.vercel-dns.com` |
| Verifikasi + SSL | ⬜ otomatis aktif setelah DNS benar (watcher berjalan, cek tiap 2 menit) |
| Nameserver saat ini | `horizon/orbit.dns-parking.com` (domain masih di registrar parkir) |
| canonical / og:url / meta | ✅ di-set ke `https://cour.fun/` (SEO/OG/Twitter) |

> Jika DNS dikelola Cloudflare: set record **"DNS only" (awan abu-abu)**, jangan proxied.
> Alternatif: ganti nameserver ke `ns1/ns2.vercel-dns.com`.

## 4. Env Frontend (Vercel `cour1/frontend`)

| Var | Status | Catatan |
|---|---|---|
| `VITE_RPC_URL` | ✅ set (production) | RPC Robinhood |
| `VITE_INDEXER_URL` | ⬜ | isi setelah indexer di-host (§2) |
| `VITE_WC_PROJECT_ID` | ⬜ | gratis di **cloud.reown.com** |
| `VITE_PINATA_JWT` | ⬜ | **pinata.cloud** (upload gambar IPFS) |

Perilaku saat kosong **rapi, bukan error** (fallback on-chain, wallet injected tetap
jalan, pesan jelas saat upload). Detail: `docs/FRONTEND_ENV.md`.

## 5. Performa (desain visual dipertahankan)

| Metric | Sebelum | Sesudah |
|---|---|---|
| **Lighthouse Performance (desktop)** | 42 | **96** |
| **Lighthouse Performance (mobile)** | ~42 | **82** |
| Accessibility / Best-Practices | 90 / 96 | 89–91 / 96 |
| FCP (desktop) | 3.3 s | **0.7 s** |
| LCP (desktop) | 4.2 s | **1.2 s** |
| TBT (desktop) | ~780 ms | **10 ms** |
| TTI (desktop) | 7.2 s | **1.2 s** |
| Ukuran HTML dokumen | **1.16 MB** (gzip 352 KB) | **599 KB** (gzip 163 KB) |

Cara: minify inline JS/CSS, externalize 430 KB base64 → aset ter-hash & cacheable,
dan **hapus semua data demo/fabrikasi** dari bundle (yang memangkas TBT ~770 ms).
Target **≥85 desktop / ≥70 mobile TERPENUHI**. Smoke 5×3×2 = 30 screenshot, 0 error.
Detail: `docs/FRONTEND_CHANGES.md §8`.

## 6. Verifikasi

- **Playwright UI E2E 5/5 hijau**, **smoke 30 shot 0 error**, build lulus.
- **cour.fun smoke**: menunggu DNS aktif (watcher jalan) — lalu smoke prod desktop+mobile.
- **Blockscout**: API di balik Cloudflare; file standard-JSON **siap** di
  `deployments/verify-blockscout/*.standard.json` (7 kontrak) + `args.txt`.
  Langkah upload manual: `docs/VERIFICATION.md`. (robin.etherscan.io sudah 7/7 verified.)

---

## 7. YANG HARUS ANDA LAKUKAN (urut) sebelum allowlist dibuka

> Allowlist **TETAP AKTIF**. `setLaunchAllowlistEnabled(false)` adalah **langkah terakhir**, hanya setelah semua di bawah.

1. **DNS cour.fun** → `A @ 76.76.21.21`, `CNAME www cname.vercel-dns.com` (Cloudflare: DNS-only). *(watcher saya akan konfirmasi)*
2. **Safe 2-of-3**: isi `OWNER_1/2/3` di `.env` → `forge script 07_DeploySafe … --broadcast` → set `MULTISIG`.
3. **Handover**: `forge script 04_HandOver … --broadcast` → `TIMELOCK` → `08_SafeHandoverTxs` → import **schedule** JSON ke Safe (2-of-3).
4. **Tunggu 48 jam** → import **execute** JSON ke Safe → `bash script/verify_handover.sh` harus lulus → **hapus `DEPLOYER_PK` dari `.env`**.
5. **Indexer**: `railway login` → ikuti `docs/INDEXER_HOSTING.md` → set `VITE_INDEXER_URL` di Vercel → redeploy.
6. **Env frontend**: isi `VITE_WC_PROJECT_ID` (reown) + `VITE_PINATA_JWT` (pinata) → redeploy.
7. **Audit independen** (opsional tapi **direkomendasikan** — internal review ≠ audit independen; `docs/RISKS.md`).
8. **Legal**: konfirmasi daftar geo-block (`frontend/src/config/regions.ts`) + disclaimer US persons.
9. **(Opsional)** tambah `public/og.png` untuk kartu sosial; verifikasi Blockscout manual.
10. **LANGKAH TERAKHIR** (via Safe → Timelock 48h): `factory.setLaunchAllowlistEnabled(false)`.

**Pemblokir peluncuran publik:** 2–4 (handover), 5 (indexer), 6 (env), 7 (audit), 8 (legal).
