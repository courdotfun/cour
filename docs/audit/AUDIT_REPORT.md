# Laporan Audit COUR (otomatis) — Robinhood Chain 4663

> Metodologi: pashov skills (x-ray + solidity-auditor 12 agen + verifikasi adversarial + fizz/medusa).
> Tanggal: 2026-10-31. Bukan pengganti audit manusia (lihat §TODO). Detail: `XRAY.md`, `FINDINGS.md`,
> `FUZZ.md`.

## 1. Ringkasan temuan per severity

| Severity | Jumlah | Status |
|---|---|---|
| **Critical** | 1 | ✅ diperbaiki + test regresi |
| High | 0 | — |
| **Low** | 4 | 4 ✅ diperbaiki + test regresi (L-1, L-2, L-3, L-4) |
| **Info** | 1 | ✅ diperbaiki (hardening) |
| Rejected/FP | 2 | ditolak dengan bukti file:line |

**Tidak ada temuan yang masih terbuka.** (L-2/L-3/L-4 di-hardening setelah deploy mainnet — lihat
§"Status deployment vs kode" di bawah.)

### Detail & status (ringkas; lengkap di `FINDINGS.md`)

| ID | Sev | File:line | Judul | Status |
|---|---|---|---|---|
| C-1 | Critical | COURFeeVault.sol:149-163 | HOLDERS self-transfer double-credit → vault drain | **FIXED** (early-return `from==to`) + `HoldersSelfTransfer.t.sol` |
| L-1 | Low | COURFeeVault.sol:280-293 | buyback 2%-cap dilewati saat reserve==0 | **FIXED** (revert saat reserve==0) |
| L-2 | Low | COURHook.sol (`twapWindowFull`) | TWAP span ~0 tepat setelah graduasi melemahkan deviation guard | **FIXED** (buyback pasca-grad revert `TwapWindowNotReady` s/d window penuh) + `BuybackGuards.t.sol` |
| L-3 | Low | COURPriceReader.sol (`refLiquidityUsd`+`_inRangeReserve`) | refLiquidityUsd pakai spot balanceOf (donation-inflatable) | **FIXED** (floor dari in-range reserve: `liquidity`+`slot0`) + `PriceReaderTest.t.sol` |
| L-4 | Low | GraduationImpl.sol / COURFactory.graduate | harga awal pool dari balanceOf kurva (manipulable) | **FIXED** (harga & LP dari akuntansi `vS0/vT0/vTStop/k`; donasi disapu) + `GraduationDonation.t.sol` |
| I-1 | Info | GraduationImpl.sol | graduate() externally callable (inert) | **FIXED** (guard `OnlyDelegatecall`) |
| FP-1 | — | COURCurve.sol:141-147 | HOLDERS buyer "capture own fee" | ditolak (by-design, self-harm) |
| FP-2 | — | COURFeeVault.sol:285 | "unaccounted refund" | FALSE POSITIVE (stockIn ← stockUsed; owed benar) |

## 2. Perubahan kode
- `src/COURFeeVault.sol`: (C-1) `beforeBalanceChange` return dini bila `from==to`; (L-1) buyback cap
  revert bila reserve/poolStock == 0 (pra- & pasca-graduasi); (L-2) buyback pasca-graduasi revert
  `TwapWindowNotReady()` sampai window TWAP penuh.
- `src/COURHook.sol` + `src/interfaces/ICOURHook.sol`: (L-2) `twapWindowFull(token)` — true setelah anchor
  TWAP ≥ `HOOK_TWAP_WINDOW` detik.
- `src/COURPriceReader.sol`: (L-3) `refLiquidityUsd` memakai in-range (virtual) reserve dari `liquidity()`
  + `slot0.sqrtPriceX96` (`_inRangeReserve`), bukan `balanceOf` → donasi tidak bisa menaikkan floor.
- `src/GraduationImpl.sol` + `src/COURFactory.sol`: (L-4) harga awal & jumlah LP diturunkan dari akuntansi
  kurva (`vS0/vT0/vTStop/k`), kelebihan donasi disapu (stock→platform, token→DEAD); (I-1) immutable `__self`
  + `revert OnlyDelegatecall()` menolak panggilan langsung.
- `src/libraries/Errors.sol`: `error OnlyDelegatecall()`, `error TwapWindowNotReady()`.
- `script/04_HandOver.s.sol`: kini juga transfer ownership `COURRouter` (baca `deployments/4663.json`).
- Test baru: `test/integration/HoldersSelfTransfer.t.sol` (regresi C-1), `BuybackGuards.t.sol` (L-2),
  `PriceReaderTest.t.sol` (L-3 donation-invariance), `GraduationDonation.t.sol` (L-4),
  `test/fizz/CurveMathFuzz.sol` (harness medusa).

## 3. Hasil fuzz (medusa) — lihat `FUZZ.md` (2 kampanye, 43 menit total, **0 pelanggaran**)
- **A — `CurveMathFuzz`** (matematika kurva, assertion-mode): **31m00s, 25.236.587 calls, 0 violations,
  4/4 properti PASSED** (launch-param p0>0 semua desimal/harga, buy reserve-delta eksak + cap graduasi +
  rounding-favours-curve, sell eksak, no-profit round-trip).
- **B — `CourFuzz`** (STATEFUL kurva+fee-vault, property+assertion): **11m58s, 1.597.269 calls, 1.083 branch,
  0 violations, 11/11 PASSED** — `property_{totalSupply, solvency, reserveRanges, vaultBuckets}` + split
  20/80 + round-trip + graduation-count. Memvalidasi akuntansi vault di bawah fuzzing stateful.
Invariant sistem juga dicakup suite invariant Foundry (`test/invariant/`); fix C-1 (HOLDERS self-transfer)
punya regresi khusus `HoldersSelfTransfer.t.sol` + `invariant_vault_buckets_match_balance`.

## 4. Coverage — `forge coverage --ir-minimum` (termasuk test fork)
- **Baris src ≈ 97,1%** (766/789) — **memenuhi ≥95% ✓**. Per-file baris: GraduationImpl/CurveMath/LaunchTax/
  PoolManagerSwapper/V3Oracle 100%; Hook 98,6%; Curve 98,2%; PriceReader 97,0%; FeeVault 96,3%; Router 95,9%;
  Factory 94,5%; Token 86,7%.
- **Branch src ≈ 65%** (111/170) — **BELUM mencapai target 80%** (naik dari 53% awal). GraduationImpl 100%
  branch; FeeVault 73%; Curve 74%; PriceReader 71%.

  **Jujur soal 80%:** metrik branch forge sangat pesimistis (tiap `require`/`&&`/`||`/ternary = 2 cabang).
  Cabang sisa yang belum tertutup: `V3Oracle` tick-sign (butuh state tick ekstrem di fork), kombinasi
  urutan-token pada fungsi _view_ hook + short-circuit `fee==0`, dan edge `divUp` di `CurveMath` — cabang
  defensif/eksotik. Sudah ditambah `BranchCoverage`/`BranchCoverage2`/`BuybackGuards`/`HoldersSelfTransfer`
  + guard tests + inklusi fork; menaikkan 65%→80% butuh puluhan micro-test both-sides untuk cabang
  defensif. **Semua guard revert kritis, kedua urutan token, keempat mode fee, konservasi, dan fix C-1
  sudah diuji** + 25,2 juta input fuzz medusa (0 pelanggaran). Dicatat sebagai rekomendasi lanjutan (target
  80% belum terpenuhi — transparan).

## 5. Deployment aktif (pasca-perbaikan, 2026-10-31)
Kontrak terbaru (sudah termasuk fix C-1/L-1/I-1) di Robinhood Chain 4663 — `deployments/4663.json`:

| Kontrak | Alamat |
|---|---|
| COURFactory | `0x2EA5E113f88A1C79F1A489fbef789578f10a070A` |
| COURFeeVault | `0x908C1B98C4F7FA9dd11A65ea5739d7030d6802bC` |
| COURHook | `0xEde81409313e7350B1952fa4cfdD4A51f1cda0cc` |
| COURRouter | `0xD9C66211F35C891C2dBfd80985363EA6da5C2006` |
| COURPriceReader | `0x7Fc9b037c9FA9B4b305f3Ce1474E5435Ef8b88B1` |
| COURCurve (impl) | `0x9a7e7B3dF3fD1c30B328f2498996c3C3d2706213` |
| GraduationImpl | `0x3eb6e58f663d89bec653809d00959c9e1101da30` |

Param 4000/60000, minBuybackUsd 50, allowlist AKTIF, owner=deployer, NVDA dikonfigurasi (semua diverifikasi
on-chain). **DEPRECATED** (mengandung bug C-1, JANGAN dipakai): factory
`0x8e27C8712FD3Ba21374F8b48A82aAf07E2838D42` (`deployments/4663-DEPRECATED.json`). Redeploy memakai ~0,0004
ETH gas, tanpa swap NVDA baru.

## 6. Verifikasi kontrak
`ETHERSCAN_API_KEY` kosong di `.env` → verifikasi otomatis belum dijalankan. Perintah lengkap + constructor
args siap di **`deployments/verify-4663.sh`** (Etherscan API v2, chainid 4663):
`ETHERSCAN_API_KEY=xxxx bash deployments/verify-4663.sh`. Blockscout di balik Cloudflare (API diblok; bisa
via UI browser, Standard-JSON dari `out/`).

## 7. Yang masih harus dilakukan manusia
- **Audit manusia tetap disarankan sebelum allowlist dibuka** (skill ini bukan pengganti audit formal).
  Kode telah di-*freeze* pada tag **`audit-freeze-v1`** untuk dikirim ke auditor (lihat `AUDIT_SCOPE.md` +
  `AUDITOR_BRIEF.md`).
- Isi `ETHERSCAN_API_KEY` dan verifikasi semua kontrak (deployment terbaru).
- Push ke GitHub: user terautentikasi (`ballasted`) belum punya akses write ke `courdotfun/cour` (403) —
  beri akses atau push sendiri.
- Lanjutkan `GO_LIVE.md` (amankan key, multisig, handover timelock, legal, indexer/frontend, monitoring).

## 8. Status deployment vs kode
- **Deployment mainnet AKTIF** (Robinhood Chain 4663, `deployments/4663.json`) = commit **`029b233`**
  ("deploy(mainnet): redeploy audit-fixed contracts"). Memuat fix **C-1, L-1, I-1**.
- **BELUM memuat** hardening **L-2, L-3, L-4** (ditambahkan setelah deploy; sekarang ada di
  `audit-freeze-v1` / HEAD `458c358`). Diff `src/`: 7 file, +81/−18 (Hook, FeeVault, Factory, PriceReader,
  GraduationImpl, ICOURHook, Errors).
- **Rencana (disepakati):** *tidak* redeploy sekarang. Kode di-**freeze** untuk audit manusia; setelah
  laporan audit bersih, lakukan **satu kali deploy final** dari commit yang telah diaudit (bukan deploy
  bertahap). Allowlist tetap AKTIF selama interval ini, jadi hanya deployer yang bisa launch — L-2/L-3/L-4
  adalah low-severity + termitigasi allowlist, sehingga aman menunda sampai deploy final.
