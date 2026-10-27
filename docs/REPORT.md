# Laporan Akhir — COUR Fase 1

> Ditulis dalam Bahasa Indonesia sesuai spesifikasi §15.

## 1. Ringkasan
COUR Fase 1 (hanya smart contract) dibangun lengkap dari repositori kosong: 7 kontrak inti + pustaka + antarmuka, dengan Foundry, Solidity 0.8.26, Uniswap v4 (hook), dan pricing tanpa oracle pihak ketiga (TWAP Uniswap v3). Creator meluncurkan token suplai tetap 1e9 di kurva ikatan konstanta-produk virtual berharga dalam **Robinhood Stock Token**, dari mcap $4.000 → $60.000. Saat habis terjual, token **lulus (graduate) dalam satu transaksi** ke pool Uniswap v4 TOKEN/STOCK dengan hook COUR, likuiditas full-range ditambahkan, dan LP **dibakar** (tidak dapat ditarik). Ada satu biaya saja — creator fee (1–10%, immutable, diambil dalam stock) dibagi 80% sisi-creator / 20% platform, dirutekan oleh salah satu dari 4 mode creator. Pajak anti-snipe meluruh selama 5 detik pertama. Seluruh akuntansi memakai satuan mentah (raw), sadar ERC-8056. Alur lengkap **telah dibuktikan berjalan secara lokal** dengan PoolManager v4 asli (tanpa fork): launch → beli → jual → graduate (dengan refund) → swap pool → fee hook → claim → buyback-burn. 74 test non-fork lulus (coverage 94,47% baris), 4 invariant lulus (8192 panggilan masing-masing), Slither bersih (tanpa High/Medium).

## 2. Daftar kontrak
| File | nSLOC | Fungsi utama |
|---|---|---|
| COURFactory.sol | 226 | `createToken`, `graduate` (init pool + LP full-range + burn), admin (`setStock/setLaunchParams/setLaunchesPaused`) |
| COURCurve.sol | 192 | `buy/sell/initialBuy`, `quoteBuy/quoteSell/quoteStockForTokens`, `progressBps`, graduasi |
| COURHook.sol | 286 | `beforeInitialize` (gating), `beforeSwap`/`afterSwap` (fee stock), akumulator tick `consult/priceInfo/poolStockReserve` |
| COURFeeVault.sol | 255 | `notify` (split 80/20 per mode), `claim/claimHolder/claimPlatform`, `beforeBalanceChange`, `executeBuyback`, recipient 2-langkah |
| COURRouter.sol | 131 | `buy/sell` (kurva/pool), `buyWithETH`, `quoteBuy/quoteSell`; tidak menyimpan dana |
| COURPriceReader.sol | 107 | `stockUsd` (TWAP v3 USDG/WETH), `refLiquidityUsd`, `bumpCardinality`, `uiMultiplier`, `consult` |
| COURToken.sol | 41 | ERC20+Permit suplai tetap; hook dividen HOLDERS |
| libraries/CurveMath.sol | 72 | matematika x·y=k, parameter launch, pembulatan pro-kurva |
| libraries/PoolManagerSwapper.sol | 59 | swap exact-input via `unlock` PoolManager |
| libraries/V3Oracle.sol | 34 | port OracleLibrary (consult, getQuoteAtTick) |
| libraries/{Constants,Errors,Events,LaunchTax,PoolKeyLib} | ~144 | definisi bersama + pajak + pool key |
| types/{CreatorMode,TokenConfig} + interfaces/* | ~167 | enum/struct + antarmuka |
| **Total src** | **~1.734** | |

## 3. Hasil test
- **Total: 77 test** (74 non-fork **lulus semua**; 3 fork lulus sebagai skip-bersih tanpa `RH_RPC_URL`). 0 gagal.
- Rincian non-fork: Smoke 3, Admin 9, CurveMath 5, LaunchTax 4, FeeModes 10, PriceReader 11, Coverage 12, HookStubs 3, V3Oracle 4, CurveFuzz 3 (1.000 run default / 10.000 di profil `ci`), LaunchToGraduation 2, LaunchTaxFlow 3, Rehearsal 1, Invariant 4.
- **Invariant** (handler, 256 run × 32 depth → 8.192 panggilan/invariant, 0 revert tak terduga): suplai konstan, solvabilitas kurva (`stockBal ≥ vS−vS0`), batas reserve (`vS≥vS0`, `vTStop≤vT≤vT0`), dan kecocokan bucket vault = saldo stock.
- **Fuzz**: round-trip beli→jual tidak pernah untung; suplai konstan; solvabilitas saat graduasi; untuk decimals {6,8,18} dan harga $1–$5.000, fee 100–1000 bps. (Fuzz menemukan & kami perbaiki bug overflow `sqrtPrice` graduasi untuk stock desimal rendah.)
- **Coverage** (`forge coverage --ir-minimum`, mengecualikan test/script & fork): **94,47% baris (717/759)**, 91,74% fungsi. Per-file: CurveMath/LaunchTax/PoolManagerSwapper/V3Oracle 100%; PriceReader 97%; Factory 95%; Hook 96%; FeeVault 94%; Curve 93%; Router 87%; Token 87%.
  Tabel lengkap:

  | File | % Baris | % Fungsi |
  |---|---|---|
  | COURCurve | 92.59 | 78.57 |
  | COURFactory | 95.28 | 85.71 |
  | COURFeeVault | 93.83 | 92.00 |
  | COURHook | 95.92 | 100.00 |
  | COURPriceReader | 96.97 | 91.67 |
  | COURRouter | 87.10 | 100.00 |
  | COURToken | 86.67 | 66.67 |
  | CurveMath / LaunchTax / PoolManagerSwapper / V3Oracle | 100.00 | 100.00 |
  | **Total** | **94.47** | **91.74** |

  **Celah < 95% (dijelaskan):** mayoritas baris tak-tercakup adalah `COURRouter.buyWithETH` (jalur ETH→WETH→stock via SwapRouter02 v3 — tidak dapat diuji lokal tanpa fork/pool v3 nyata) plus beberapa cabang defensif (mis. dust-sweep, fallback). Semua jalur inti (kurva, graduasi, hook fee, vault, buyback) tercakup. Cabang (`% Branches` 53%) rendah karena banyak cabang adalah guard revert yang sebagian diuji; jalur sukses terbukti.
- **Gas** (perkiraan dari uji): `createToken` ~1,8jt; `buy` kurva ~0,27jt; graduasi (dalam `buy` besar) + swap pool via router + `executeBuyback` berjalan di uji integrasi/rehearsal. Jalankan `forge test --gas-report` untuk angka terkini.

## 4. Hasil rehearsal
Lihat `docs/REHEARSAL_RESULT.md` (dibangkitkan oleh `forge test --match-test test_rehearsal`). Ringkas (mock NVDA @ $100, CTEST, fee 5%, BUYBACK_BURN): initial buy 15 NVDA bebas pajak (~2,67e8 token), sniper dt=0 **ditolak** (99% pajak + fee > 100%), pajak meluruh pada dt=1/2, pembelian besar menyilang stop → **refund** (hanya ~96 dari 2.000 NVDA terpakai) + **graduasi**, swap pool dua arah via router, buyback membakar token ke DEAD, dan klaim platform ke treasury. Versi fork: `script/03_LaunchRehearsal.s.sol` (perlu RPC).

## 5. Keputusan yang diambil
Ringkasan (detail: `docs/DECISIONS.md`):
- **Graduation call path**: kurva memanggil `factory.graduate` (onlyCurve); factory menarik stock+token (disetujui kurva), init pool, tambah LP full-range yang **dimiliki factory tanpa jalur penarikan = LP terbakar**, `positionId=0`. Lebih trustless daripada NFT→dEaD dan menghindari ketergantungan PositionManager/Permit2.
- **Exact-output**: direvert (`ExactOutputNotSupported`) di MVP; stretch goal dibiarkan di belakang `EXACT_OUTPUT_ENABLED=false` — **tidak diaktifkan** karena belum diimplementasi/diuji penuh.
- **Metode pengecualian creator (anti-snipe)**: TIDAK memakai `tx.origin`. Hanya `initialBuy` atomik (onlyFactory) dan buyback vault yang bebas pajak; semua beli lain di jendela 5 detik kena pajak → tidak ada yang bisa dipalsukan. Beli di detik-0 otomatis revert bersih.
- v4-core tunggal dari submodule v4-periphery; `via_ir=true` + `optimizer_runs=44444444`; siklus deploy hook↔factory↔curveImpl dipecah via prediksi alamat CREATE factory; encoding `sqrtPrice` X128 (anti-overflow). Lint `unsafe-typecast`/`block-timestamp` dikecualikan (aman/di-mandat).

## 6. Fakta chain yang diverifikasi / dikoreksi
Lihat `docs/CHAIN_FACTS.md`. Penting: **belum ada verifikasi on-chain** karena tidak ada RPC/jaringan di lingkungan build — `00_VerifyChain` dan uji fork ditulis namun belum dijalankan terhadap mainnet. Alamat NVDA & pool NVDA/USDG dikoreksi ke checksum EIP-55. `wethUsdgPool` belum diketahui (dibiarkan 0x0). Dukungan Cancun/transient-storage Robinhood Chain belum diverifikasi.

## 7. Risiko & temuan terbuka
- **Belum terverifikasi on-chain** (alamat, metadata NVDA, kesiapan TWAP, Cancun). Harus dijalankan manusia dengan RPC sebelum deploy. Uji fork & `03_LaunchRehearsal` versi fork belum dieksekusi.
- **Slither**: 79 temuan, **tanpa High/Medium**; semua di-triase sebagai by-design (timestamp), reentrancy-events kosmetik (jalur state ber-guard transient), kompleksitas siklomatik, atau false-positive (`dead-code`/`constable`/`immutable` — fungsi/variabel sebenarnya dipakai/dimutasi). Detail: `docs/AUDIT_SCOPE.md` + `docs/slither-report.txt`.
- Guard 2%-reserve buyback pasca-graduasi bersifat best-effort; proteksi utama = deviasi TWAP + `minTokensOut`.
- `buyWithETH` mengasumsikan pool WETH/stock v3 pada fee 0,3% (konveniens; bukan jalur inti).
- TWAP hook adalah penjaga deviasi, bukan oracle presisi tinggi (jendela ~[300s,600s]).
- Kompilasi lambat (~40–90s) karena `optimizer_runs` tinggi — perlu untuk v4-core.

## 8. Yang harus dilakukan manusia (TODO, berurutan)
1. Isi `.env` (`RH_RPC_URL`, `DEPLOYER_PK`, `TREASURY`, `MULTISIG`, `BLOCKSCOUT_API_KEY`).
2. Jalankan `./bootstrap.sh`, lalu `forge build` & `forge test` (konfirmasi hijau di mesin Anda).
3. Jalankan `script/00_VerifyChain` dengan RPC asli; catat hasil di `CHAIN_FACTS.md`; konfirmasi dukungan Cancun/transient storage.
4. Konfirmasi daftar token stock kanonik (NVDA/TSLA/AAPL/SPY/…) + pool v3 USDG mereka; isi `wethUsdgPool` bila perlu.
5. Konfirmasi perilaku pause stock token dengan Robinhood.
6. Review hukum (sekuritas / pembatasan geografis / larangan US persons).
7. Jalankan uji fork penuh (`RH_RPC_URL` di-set) dan `03_LaunchRehearsal` pada anvil fork.
8. Pesan auditor — kirim `docs/AUDIT_SCOPE.md` (+ repo). Jalankan ulang Slither/Aderyn di mesin Anda.
9. Buat Safe multisig di Robinhood Chain (atau alternatif) → `04_HandOver` (Timelock 48 jam).
10. Deploy testnet (46630) + uji publik; lalu deploy mainnet dengan allowlist peluncuran bertahap; verifikasi Blockscout.
11. Siapkan indexer (Fase 1C) & wiring frontend (Fase 1D) — ABI/event sudah siap (lihat ARCHITECTURE.md).

## 9. Perintah penting
```
./bootstrap.sh                                   # ambil dependency (lib/ gitignored)
forge build
forge test                                       # unit+fuzz+invariant+integration (fork skip tanpa RPC)
FOUNDRY_PROFILE=ci forge test                    # 10.000 run fuzz
forge test --match-test test_rehearsal           # tulis docs/REHEARSAL_RESULT.md
forge coverage --ir-minimum --report summary     # coverage
python -m slither . --filter-paths "lib|test|script" --exclude-dependencies
forge script script/00_VerifyChain.s.sol --rpc-url $RH_RPC_URL
forge script script/01_DeployCore.s.sol --rpc-url $RH_RPC_URL --broadcast
forge script script/02_ConfigureStocks.s.sol --rpc-url $RH_RPC_URL --broadcast
anvil --fork-url $RH_RPC_URL --chain-id 4663     # untuk rehearsal fork
forge script script/04_HandOver.s.sol --rpc-url $RH_RPC_URL --broadcast
```

## Catatan coverage
Angka final 94,47% baris tercatat di §3. `forge coverage` wajib memakai `--ir-minimum` karena proyek memakai `via_ir`. Untuk mencapai ≥95%, tambahkan uji fork `buyWithETH` (perlu pool WETH/stock v3) — itu satu-satunya blok baris besar yang tersisa.
