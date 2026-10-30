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

## 3. Hasil fuzz (medusa)
Lihat `FUZZ.md`. Harness `CurveMathFuzz` (assertion-mode) pada matematika inti kurva (launch params,
buy/sell/graduation reserve moves, rounding-favours-curve, no-profit round-trip), dijalankan medusa 1.5.1.
_(Ringkasan angka diisi setelah kampanye 31 menit selesai.)_

## 4. Coverage
_(Diisi setelah pengukuran; target branch src ≥80%.)_

## 5. Deployment aktif
_(Diisi setelah redeploy pasca-perbaikan. Deployment LAMA ditandai DEPRECATED karena mengandung bug C-1.)_

## 6. Verifikasi kontrak
Explorer robin.etherscan.io butuh `ETHERSCAN_API_KEY` (Etherscan API v2, chainid 4663) — saat ini kosong
di `.env`. Perintah lengkap + constructor args disiapkan (lihat §6 di `MAINNET_SMOKE_RESULT.md` dan di sini
setelah redeploy). Blockscout di balik Cloudflare (API diblok; bisa via UI browser).

## 7. Yang masih harus dilakukan manusia
- **Audit manusia tetap disarankan sebelum allowlist dibuka** (skill ini bukan pengganti audit formal).
- Isi `ETHERSCAN_API_KEY` dan verifikasi semua kontrak (deployment terbaru).
- Push ke GitHub: user terautentikasi (`ballasted`) belum punya akses write ke `courdotfun/cour` (403) —
  beri akses atau push sendiri.
- Hardening L-2/L-3/L-4 (opsional, direkomendasikan sebelum publik): TWAP min-window untuk buyback;
  refLiquidity dari in-range liquidity; harga graduasi dari `vS/vTStop`.
- Lanjutkan `GO_LIVE.md` (amankan key, multisig, handover timelock, legal, indexer/frontend, monitoring).
