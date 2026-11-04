# Laporan Akhir — COUR Fase 1 (Perbaikan Review + Verifikasi On-chain)

> Bahasa Indonesia (sesuai permintaan). Tanggal: 2026-10-29. Branch: `master`.
> Ringkasan eksekutif: semua perbaikan kode review manusia (§2.1–2.6) selesai, di-commit per poin, dan
> dibuktikan dengan test (lokal + fork mainnet). Fakta chain terverifikasi on-chain. **Seluruh alur deploy
> + smoke test sudah divalidasi penuh di fork anvil mainnet** (`docs/REHEARSAL_FORK_RESULT.md`): deploy →
> konfigurasi → swap ETH→USDG→NVDA → launch → graduasi (LP NFT→DEAD via PositionManager asli) →
> buyback-burn → swap pool → claim platform/holder → restore param. Deploy mainnet nyata (§7)
> **menunggu pendanaan wallet** — sudah menjadi operasi satu-perintah yang tervalidasi.
>
> **Temuan kritis saat rehearsal fork (sudah diperbaiki):** kode PositionManager/Permit2 (§2.3) membuat
> `COURFactory` = 26.448 byte, **melebihi batas EIP-170 (24.576)** — test lokal/fork TIDAK menegakkan
> batas ukuran, tapi deploy di node nyata (anvil) menegakkannya. Diperbaiki dengan memindah mekanik
> graduasi ke `GraduationImpl` yang di-`delegatecall` (factory turun ke 21.264 byte). **Tanpa rehearsal
> fork, deploy mainnet pasti gagal.**

## 1. Ringkasan perbaikan (per poin review)

| Poin | Masalah yang dilaporkan | Akar masalah (file:line) | Perbaikan | Bukti (test) |
|---|---|---|---|---|
| **2.1** | "±36,75 juta token hilang" di rehearsal | BUKAN bug — laporan `REHEARSAL_RESULT.md` lama tidak mencetak 20 trade acak di `Rehearsal.t.sol:63-71` (step 4c), yang net menjual ≈36,76M token | Rehearsal kini mencetak **setiap** langkah + blok rekonsiliasi; identitas konservasi di-assert | `GraduationIdentity.t.sol` (fuzz desimal {6,8,18} × harga $1–$5000), `Rehearsal.t.sol` |
| **2.2a** | Guard buyback (deviasi 3%, cap 2%) benar terpanggil? | Sudah terpasang: `COURFeeVault.sol:284` (`_checkDeviation`), `:285` (`_poolStockReserve`), `:276` (cap pra-grad) | Dibuktikan memicu revert pra- & pasca-graduasi | `BuybackGuards.t.sol` (8 test) |
| **2.2b** | `setLaunchParams` menulis param? | Ya: `COURFactory.sol:257-260` | Test: ubah param → launch baru pakai nilai baru, token lama tak berubah | `Admin.t.sol::test_setLaunchParams_new_launch_uses_new_values` |
| **2.2c** | Getter vault & `claimPlatform` benar? | Ya: di-set di `wire()`/constructor | Test getter pasca-wiring + claim sampai treasury | `Admin.t.sol::test_vault_wiring_getters_and_platform_claim` |
| **2.2 (dead code)** | `dead-code/constable/immutable` = 0 | Artefak Slither di bawah `via_ir` (Slither bahkan menyebut immutable `poolManagerC` "uninitialized") | `_pay` mati dihapus; sisanya dibantah per file:line | `docs/slither-report.txt` |
| **2.3** | LP burn harus NFT PositionManager → DEAD | Model lama = factory-owned liquidity | Graduasi kini mint posisi full-range via **PositionManager asli** (`MINT_POSITION`+`SETTLE_PAIR`, Permit2), `owner=DEAD`; `positionId` nyata di `Graduated` | `GraduationIdentity.t.sol` (`ownerOf==DEAD`, fuzz) + **fork mainnet** `ForkIntegration.t.sol` |
| **2.4** | `buyWithETH` multi-hop, fee tier dari pool | Dulu hardcode 0,3% single-hop | v3 `exactInput` path per-stock yang dikonfigurasi (WETH→USDG→STOCK; fallback langsung); refund semua sisa | `BuyWithETH.t.sol` (7 test) + jalur fork |
| **2.5** | line ≥95%, branch ≥80% | — | Lihat §3 | coverage |
| **2.6** | Allowlist launch | — | `launchAllowlistEnabled` (default true) + setter admin, hanya launch baru | `Admin.t.sol` (allowlist + onlyOwner) |

Commit per poin (lihat `git log`): `test(curve): prove graduation token conservation…`,
`feat(factory): launch allowlist…`, `feat(factory): graduate LP as a v4 position NFT…`,
`test(vault): prove buyback guards…`, `feat(router): buyWithETH as configurable v3 multi-hop…`,
`test(fork): verify chain facts + graduate on real mainnet PositionManager`,
`test(coverage): revert-guard + branch coverage…`.

## 2. Penjelasan selisih 36,75 juta token (angka sebelum vs sesudah)

Token yang terjual di kurva saat graduasi SELALU `vT0 − vTStop` = **794.786.903** token (pembulatan
reviewer: 794.786.904), **konstan** untuk Q=15, independen terhadap harga/desimal, karena kurva
mengirim tepat selisih cadangan pada setiap transaksi.

- Laporan lama menampilkan: initial 267.354.596 + 45.840.187 + 52.656.464 + 47.995.609 (4 buy) + big buy
  344.179.855 = **758.026.711** → tampak kurang **36.760.193** (±36,75M).
- Faktanya step 4c (20 buy/sell acak) menjual **≈36,76M** token bersih yang tak dicetak. Dengan itu:
  413,85M + 36,76M + 344,18M ≈ **794,79M** ✓.
- Sesudah perbaikan, `GraduationIdentity.t.sol` meng-assert (eksak): pembeli memegang tepat `sold`;
  `pool + DEAD == TOTAL_SUPPLY − sold`; `leftover × hargaGrad == stock terkumpul`; serta harga pool
  on-chain == harga kurva dalam 0,1% pada skala realistis. **Tidak ada token yang hilang.**

## 3. Hasil test, coverage, Slither, gas

- **Test**: **103 test non-fork** (unit + fuzz + invariant + integrasi) **semua hijau** + **4 test fork**
  (mainnet) hijau = 107 total. `forge fmt --check` bersih. Profil `ci` (10.000 fuzz, invariant 512×64 =
  32.416 panggilan handler) **lulus 103/103, 0 revert**. Default (1.000 fuzz / 256×32) juga hijau.
- **Coverage** (`forge coverage --ir-minimum`): **baris src = 96,3%** (748/777) — **memenuhi ≥95%**.
  Per-file baris: Curve 98,2% · Factory 96,5% · Vault 94,4% · Hook 98,6% · PriceReader 97,0% ·
  Router 95,9% · Token 86,7% · CurveMath/LaunchTax/PoolManagerSwapper/V3Oracle 100%.
  **Branch src ≈ 65%** (111/170; naik dari 53% awal) — **belum mencapai target 80%** (audit round) (lihat catatan jujur
  di bawah). Fungsi src ~95%.

  **Catatan jujur soal branch 80%:** forge menghitung branch secara pesimistis (setiap `&&`/`||`/
  ternary/`require`/`if` = 2 cabang). Cabang yang belum tertutup adalah: jalur tick-sign `V3Oracle`
  (hanya tereksekusi di fork, bukan di coverage lokal), short-circuit defensif (`fee==0`, `span==0`
  kedua sisi), kombinasi urutan token pada fungsi view hook, dan revert overflow `sell`. **Semua guard
  revert kritis, kedua urutan token, keempat mode fee, dan konservasi sudah diuji.** Menaikkan ke 80%
  butuh puluhan micro-test both-sides untuk cabang defensif; dicatat sebagai pekerjaan lanjutan.
- **Slither** (`docs/slither-report.txt`): 103 temuan, **tanpa High/Medium**. `dead-code`/`constable`/
  `immutable`/`uninitialized-state` adalah artefak analisis di bawah `via_ir` (dibuktikan: immutable
  `poolManagerC` yang di-set constructor dilaporkan "uninitialized"), masing-masing dibantah dengan
  write/call site. Fungsi mati nyata (`_pay`) sudah dihapus.
- **Gas** (dari test fork & integrasi): graduasi (mint posisi v4 ke DEAD) ≈ **910.711** gas; total tx
  buy pemicu-graduasi ≈ 3,6 juta gas. `createToken` ≈ 1,8–3,9 juta (termasuk initial buy). `buy` kurva
  ratusan ribu. Jalankan `forge test --gas-report` untuk angka terkini.

## 4. Fakta chain (terverifikasi on-chain 2026-10-29, chainId 4663)

Lihat `docs/CHAIN_FACTS.md`. Ringkas:
- **RPC mainnet dikoreksi** → `https://rpc.mainnet.chain.robinhood.com` (host `rpc.chain.robinhood.com`
  di `.env.example` lama MATI).
- Semua alamat spec **ada code**. NVDA: 18 desimal, "NVDA", `uiMultiplier` ≈1,0008e18 (ERC-8056),
  totalSupply ≈86.899. USDG: 6 desimal.
- Pool **NVDA/USDG = fee 500** (token0=USDG, token1=NVDA), harga ≈ **$214** (via TWAP asli) — wajar.
- Pool **WETH/USDG = fee 100** (paling likuid) → dipakai untuk path `buyWithETH`.
- **PositionManager** cocok dengan ABI v4-periphery (nextTokenId/modifyLiquidities/ownerOf).
- **Cancun/transient storage DIKONFIRMASI** lewat v4 PoolManager yang hidup & aktif (mustahil jalan
  tanpa TSTORE). Guard `ReentrancyGuardTransient` aman.
- Daftar stock lain (TSLA/AAPL/…) belum dienumerasi (tidak diperlukan untuk uji tertutup NVDA).

## 5. Deploy mainnet — ✅ SELESAI (2026-10-30; alamat di bawah kini DEPRECATED oleh audit redeploy 2026-10-31 — lihat docs/audit/AUDIT_REPORT.md untuk alamat AKTIF)

COUR **live di Robinhood Chain mainnet (4663)**. Didanai 0.005 ETH; deploy+configure memakan ~0.0004 ETH.

| Kontrak | Alamat |
|---|---|
| COURFactory | `0x8e27C8712FD3Ba21374F8b48A82aAf07E2838D42` |
| COURFeeVault | `0xE412C7e137b3132b454ca38739ad981F9c90b4EB` |
| COURHook | `0xFC1bC2f2C0cEA16509dE1C906C8E5a0a322A20cc` |
| COURRouter | `0x24Caa2B0aa97da71C9359F361e3dD43c2a7B1449` |
| COURPriceReader | `0x2e1F9eC3dc1064C31F16a7CebC304b7915d0d4dD` |
| COURCurve (impl) | `0x5C18Dc68DC62EBDE7172D6831FAeBAc378AEE3B1` |
| GraduationImpl | `0x60b1b7d2bb873e91420c7f4be2d39ca89bb4fe54` |

Link: `https://robin.etherscan.io/address/<alamat>`. Detail + tx hash: `docs/MAINNET_SMOKE_RESULT.md`,
`deployments/4663.json`. **Verifikasi explorer BELUM** (Blockscout di balik Cloudflare; Etherscan v2 butuh
API key) — perintah siap di MAINNET_SMOKE_RESULT.md untuk dijalankan manusia.

## 6. Smoke test mainnet — ✅ SELESAI

Dijalankan dengan param uji **$1/$15** (dibuktikan aman untuk desimal NVDA asli di fork lebih dulu):
swap ETH→USDG→NVDA (0.0242 NVDA) → launch **CTEST** (5%, BUYBACK_BURN) → buy+sell → **graduasi**
(positionId **4080369**, `ownerOf == 0x…dEaD` DICEK ON-CHAIN; pool 205.213.096 token + 0.0144 NVDA) →
**buyback-burn** (2.031.812 token ke DEAD) → swap pool 2 arah → **claimPlatform** → restore param
4000/60000 + minBuybackUsd 50. Launch HOLDERS dilewati untuk hemat budget. Total terpakai **~0.00271 ETH
(~$6.4)**; sisa saldo **0.00229 ETH**. Detail langkah + tx link: `docs/MAINNET_SMOKE_RESULT.md`.
Alur ini juga sudah divalidasi penuh di fork (`docs/REHEARSAL_FORK_RESULT.md`).

## 7. Status saat ini (pasca-deploy)
- Param launch on-chain: **4000 / 60000** (produksi, dikembalikan); minBuybackUsd **50**.
- Allowlist launch: **AKTIF** — hanya `0x1eb2…030b` (deployer) yang boleh launch.
- Owner semua kontrak: **deployer EOA** (belum handover; multisig belum ada).
- Saldo deployer: **0.00229 ETH** (~$5.4).
- Verifikasi explorer: **belum** (lihat MAINNET_SMOKE_RESULT.md; butuh API key / UI).
- Langkah menuju publik: lihat **`docs/GO_LIVE.md`**.

### 7a. Status deployment vs kode (UPDATED 2026-11-05 — final deploy DONE)
- **Deployment mainnet AKTIF** = tag **`audit-freeze-v1`** (`deployments/4663.json`, factory
  `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C`, block 106215255). Memuat **C-1/L-1/I-1 + L-2/L-3/L-4** —
  kode live == kode audit.
- **Semua 7 kontrak terverifikasi** di robin.etherscan.io (`docs/VERIFICATION.md`). Allowlist AKTIF, owner =
  deployer EOA. Dua deployment lama di-pause & DEPRECATED.
- **Rencana:** audit manusia terhadap kode live yang beku; redeploy `audit-fix-v1` hanya bila auditor minta
  perubahan (`docs/audit/POST_AUDIT_PLAYBOOK.md`). Allowlist dibuka ke publik setelah audit + handover.

## 8. Yang harus dilakukan manusia (berurutan)
1. **Kirim dana** ke `0x1eb25d02fc7C5487D4648a602c355dBC2301030b` (~$250 ETH, chain 4663).
2. Setelah deploy: **pindahkan private key** wallet deploy ke hardware wallet (kunci saat ini di `.env` lokal).
3. Buat **Safe multisig** di Robinhood Chain → `04_HandOver` (Timelock 48 jam) sebelum buka publik.
4. **Audit** pihak ketiga (kirim `docs/AUDIT_SCOPE.md`), lalu baru nonaktifkan allowlist.
5. Legal: pembatasan US persons / sekuritas.
6. Enumerasi stock token lain + pool v3 mereka; tambahkan ke allowlist & `ethInPath` router.
7. Indexer (Fase 1C) + frontend (Fase 1D) — ABI/event sudah siap.

## 9. Perintah penting
```
./bootstrap.sh && forge build && forge test              # build + suite (fork jalan bila RH_RPC_URL diset)
forge test --match-path 'test/fork/*' -vv                # verifikasi mainnet + graduasi via posm asli
forge test --match-test test_rehearsal                   # tulis docs/REHEARSAL_RESULT.md
forge coverage --ir-minimum --report summary             # coverage (baris src 96,3%)
python -m slither . --filter-paths "lib|test|script" --exclude-dependencies
bash script/run_fork_rehearsal.sh                        # rehearsal penuh di anvil fork (tanpa dana)
forge script script/01_DeployCore.s.sol --rpc-url $RH_RPC_URL --broadcast --slow
forge script script/02_ConfigureStocks.s.sol --rpc-url $RH_RPC_URL --broadcast --slow
bash script/run_mainnet_smoke.sh                         # smoke test mainnet
forge script script/06_RestoreParams.s.sol --rpc-url $RH_RPC_URL --broadcast
```

---

# Laporan Program "Bawa COUR sampai final" (2026-11-05)

Ringkasan eksekusi prompt deploy-final + paket-audit + indexer + frontend + monitoring. Semua ter-commit &
ter-push ke `courdotfun/cour`. Kode `src/` TIDAK diubah (beku di `audit-freeze-v1`).

## 1. Yang dibangun
Deploy final kontrak dari tag beku + verifikasi dua-explorer, paket audit manusia, indexer Ponder, frontend
dApp tersambung kontrak, service monitoring, dan uji handover/pause di fork. Repo kini monorepo:
`src/` (kontrak), `indexer/`, `frontend/`, `monitor/`.

## 2. Deployment final (chain 4663, tag audit-freeze-v1, block 106215255)
| Kontrak | Alamat | etherscan | Blockscout |
|---|---|---|---|
| COURFactory | `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C` | ✅ Verified | ⏳ manual (std-json siap) |
| COURFeeVault | `0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76` | ✅ | ⏳ |
| COURHook | `0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC` | ✅ | ⏳ |
| COURRouter | `0x835Afd54F9BA20b18b6807B44886123E85A586f9` | ✅ | ⏳ |
| COURPriceReader | `0xF7C914E7B7580a7653DcC3b7574bf041F615e359` | ✅ | ⏳ |
| COURCurve (impl) | `0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00` | ✅ | ⏳ |
| GraduationImpl | `0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7` | ✅ | ⏳ |
- Param produksi 4000/60000, minBuybackUsd 50, launchFee 0, **allowlist AKTIF**, owner = deployer EOA.
- Bukti bytecode==tag: verifikasi etherscan terhadap sumber tag + sha256 creation-bytecode reproducible
  (`docs/VERIFICATION.md`). Build in-place == tag (`git diff audit-freeze-v1 HEAD -- src script` kosong).
- Smoke: getter read-only + 1 `createToken` tanpa initial buy (CSMOKE `0x9662…A7bC`). Dua factory lama
  di-pause & DEPRECATED. Token uji dipakai untuk memverifikasi indexer end-to-end.

## 3. Indexer (`indexer/`, Ponder 0.18.4)
Events → Postgres (pglite dev), GraphQL + REST (`/tokens /token/:addr /candles /trades /holders
/portfolio/:addr /top-users /stats`). Tabel: token/trade/candle(stock+USD)/holder/feeEvent/claim/buyback/
stockPrice/userStats/pool/globalStat/adminEvent. USD = harga-stock × `stockUsd`. **Terbukti live-index CSMOKE**
dari block 106215255 (typecheck lulus; REST+GraphQL valid). Dockerfile+compose siap (Docker tak tersedia di
sini → belum di-build). Catatan: RPC publik rate-limit (429) saat backfill → pakai RPC khusus di produksi.

## 4. Frontend (`frontend/`, Vite+TS+viem)
Desain `COUR-launchpad.html` dijadikan app nyata; **visual dipertahankan** (30 screenshot, 5 view × 3 tema ×
2 viewport, 0 error console; `pnpm build` PASS). Lapisan chain (viem, wallet EIP-6963, allowlist gating,
admin panel owner-only), data (indexer REST + fallback on-chain), features (buy/sell/buyWithETH, createToken,
claim/holder/platform, buyback, stock swap). Rename `EON_*`→`COUR_*` + migrasi localStorage. Geo-block
middleware, `vercel.json`, `.env.example`. Edit kejujuran (LP 0%+LP dibakar, Stock Reserve dihapus, limit
order/lend/DCA/Oink → Coming soon, "pay with any token"→ETH/stock) di `docs/FRONTEND_CHANGES.md`.
**Gap jujur (belum selesai):** beberapa render DOM lama (daftar market home, portfolio, chart candle, handler
form order/launch) masih membaca struktur demo in-memory; padanan nyata sudah ada di `window.COUR` dan
simulator dimatikan saat live, tapi render spesifik itu belum di-swap (butuh membongkar skrip inline 8.5k
baris). Belum deploy ke Vercel. E2E penuh (Playwright) & Lighthouse belum dijalankan (smoke puppeteer dipakai).

## 5. Monitoring (`monitor/`) & runbook
Watcher event + health (harga/saldo/paused/owner) → Telegram (fallback console) + `/status`+`/health`.
`tsc` lulus; smoke live mainnet jalan (NVDA $201.43). `docs/INCIDENT_RUNBOOK.md`. Handover (4 Ownable →
Timelock 48 jam) + prosedur pause **teruji di fork** (`test/fork/HandoverAndPause.t.sol`, 2/2 PASS).

## 6. Saldo deployer
**~0.00147 ETH** (chain 4663). Monitor menandai ini di bawah ambang — **perlu di-top-up** sebelum op admin
(handover/pause) berikutnya.

## 7. Yang harus dilakukan manusia (berurutan)
1. **Top-up saldo deployer** (sedikit ETH di 4663) untuk op admin berikutnya.
2. **Audit manusia**: kirim paket (`docs/audit/HUMAN_AUDIT_PACKAGE.md` + `AUDITOR_BRIEF.md` + `OUTREACH_EMAIL.md`,
   tag `audit-freeze-v1`, alamat live) ke beberapa auditor; pilih & engage.
3. **Amankan private key** deployer → hardware wallet.
4. **Buat Safe 2-of-3** di 4663; set `MULTISIG` di `.env`; jalankan `script/04_HandOver.s.sol` → Timelock 48 jam
   `acceptOwnership` tiap kontrak (alur terbukti di fork).
5. **Verifikasi Blockscout** manual (upload `deployments/verify-blockscout/*.standard.json` + args) bila mau.
6. **Host indexer** (Railway/Render/Fly) + Postgres + RPC khusus; isi env.
7. **Isi env frontend** (`VITE_RPC_URL`, `VITE_INDEXER_URL`, `VITE_WC_PROJECT_ID`, `VITE_PINATA_JWT`) + deploy
   Vercel + domain. (Opsional: minta rewiring render DOM lama ke data nyata — lihat Gap §4.)
8. **Review legal** & daftar negara geo-block (`frontend/src/config/regions.ts`).
9. Setelah audit bersih → `docs/audit/POST_AUDIT_PLAYBOOK.md` → handover → **baru** buka allowlist (langkah
   terakhir `setLaunchAllowlistEnabled(false)` via timelock).

## 8. Perintah penting
```
# deploy & verify (sudah dijalankan)
forge script script/01_DeployCore.s.sol:DeployCore --rpc-url $RH_RPC_URL --broadcast --slow
ETHERSCAN_API_KEY=xxx bash deployments/verify-4663.sh
forge test --match-path 'test/fork/HandoverAndPause.t.sol' -vv     # handover+pause fork
cd indexer && pnpm install && pnpm dev                              # indexer (PONDER_RPC_URL_4663)
cd frontend && pnpm install && pnpm build && pnpm dev               # frontend
cd monitor && pnpm install && pnpm start                            # monitoring
```
