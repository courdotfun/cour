# Laporan Audit COUR (otomatis) — Robinhood Chain 4663

> Metodologi: pashov skills (x-ray + solidity-auditor 12 agen + verifikasi adversarial + fizz/medusa).
> Tanggal: 2026-10-31. Bukan pengganti audit manusia (lihat §TODO). Detail: `XRAY.md`, `FINDINGS.md`,
> `FUZZ.md`.

## 1. Ringkasan temuan per severity

| Severity | Jumlah | Status |
|---|---|---|
| **Critical** | 1 | ✅ diperbaiki + test regresi |
| High | 0 | — |
| **Low** | 4 | 2 ✅ diperbaiki, 2 📝 di-acknowledge (mitigasi + rekomendasi) |
| **Info** | 1 | ✅ diperbaiki (hardening) |
| Rejected/FP | 2 | ditolak dengan bukti file:line |

### Detail & status (ringkas; lengkap di `FINDINGS.md`)

| ID | Sev | File:line | Judul | Status |
|---|---|---|---|---|
| C-1 | Critical | COURFeeVault.sol:149-163 | HOLDERS self-transfer double-credit → vault drain | **FIXED** (early-return `from==to`) + `HoldersSelfTransfer.t.sol` |
| L-1 | Low | COURFeeVault.sol:280-293 | buyback 2%-cap dilewati saat reserve==0 | **FIXED** (revert saat reserve==0) |
| L-2 | Low | COURHook.sol:298-321 | TWAP span ~0 tepat setelah graduasi melemahkan deviation guard | ACK (self-affecting; guard lain 2%+minTokensOut; RISKS) |
| L-3 | Low | COURPriceReader.sol:92-103 | refLiquidityUsd pakai spot balanceOf (donation-inflatable) | ACK (floor-bypass, biaya attacker, allowlist-mitigated) |
| L-4 | Low | GraduationImpl.sol:47-55 | harga awal pool dari balanceOf kurva (manipulable) | ACK (griefing, self-cost, arb-corrected; rekom: pakai vS/vTStop) |
| I-1 | Info | GraduationImpl.sol | graduate() externally callable (inert) | **FIXED** (guard `OnlyDelegatecall`) |
| FP-1 | — | COURCurve.sol:141-147 | HOLDERS buyer "capture own fee" | ditolak (by-design, self-harm) |
| FP-2 | — | COURFeeVault.sol:285 | "unaccounted refund" | FALSE POSITIVE (stockIn ← stockUsed; owed benar) |

## 2. Perubahan kode
- `src/COURFeeVault.sol`: (C-1) `beforeBalanceChange` return dini bila `from==to`; (L-1) buyback cap
  revert bila reserve/poolStock == 0 (pra- & pasca-graduasi).
- `src/GraduationImpl.sol`: (I-1) immutable `__self` + `revert OnlyDelegatecall()` menolak panggilan langsung.
- `src/libraries/Errors.sol`: `error OnlyDelegatecall()`.
- `script/04_HandOver.s.sol`: kini juga transfer ownership `COURRouter` (baca `deployments/4663.json`).
- Test baru: `test/integration/HoldersSelfTransfer.t.sol` (regresi C-1), `test/fizz/CurveMathFuzz.sol`
  (harness medusa).

## 3. Hasil fuzz (medusa) — lihat `FUZZ.md`
Harness `test/fizz/CurveMathFuzz.sol` (assertion-mode) pada matematika inti kurva, medusa 1.5.1, **31m00s,
25.236.587 calls, 0 violations, 4/4 properti PASSED**. Properti: launch-param sanity (p0>0 untuk semua
desimal/harga), buy = reserve-delta eksak + cap graduasi + rounding-favours-curve, sell eksak +
rounding-favours-curve, dan no-profit round-trip. Invariant sistem (supply konstan, solvensi kurva,
solvensi bucket vault termasuk fix self-transfer) dicakup suite invariant Foundry (`test/invariant/`).

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
- Isi `ETHERSCAN_API_KEY` dan verifikasi semua kontrak (deployment terbaru).
- Push ke GitHub: user terautentikasi (`ballasted`) belum punya akses write ke `courdotfun/cour` (403) —
  beri akses atau push sendiri.
- Hardening L-2/L-3/L-4 (opsional, direkomendasikan sebelum publik): TWAP min-window untuk buyback;
  refLiquidity dari in-range liquidity; harga graduasi dari `vS/vTStop`.
- Lanjutkan `GO_LIVE.md` (amankan key, multisig, handover timelock, legal, indexer/frontend, monitoring).
