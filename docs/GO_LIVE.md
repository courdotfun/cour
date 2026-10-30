# GO LIVE — Dari Deploy Tertutup ke Publik (COUR, Robinhood Chain 4663)

> Kondisi SEKARANG: kontrak live di mainnet, **allowlist launch AKTIF** (hanya deployer), owner = **EOA
> deployer**, param produksi 4000/60000, smoke test sukses (lihat `MAINNET_SMOKE_RESULT.md`). Dokumen ini
> adalah urutan langkah menuju pembukaan publik. Tandai: **[WAJIB]** sebelum publik, **[OPSIONAL]** boleh
> menyusul. "Siapa": 🧑 manusia / 🤖 Claude Code. Biaya gas sangat murah di 4663 (~0.0005 ETH/op).

Alamat: factory `0x8e27C8712FD3Ba21374F8b48A82aAf07E2838D42`, feeVault
`0xE412C7e137b3132b454ca38739ad981F9c90b4EB`, priceReader `0x2e1F9eC3dc1064C31F16a7CebC304b7915d0d4dD`,
router `0x24Caa2B0aa97da71C9359F361e3dD43c2a7B1449`, hook `0xFC1bC2f2C0cEA16509dE1C906C8E5a0a322A20cc`.

---

## 1. [WAJIB] Amankan private key deployer — 🧑
- **Apa**: pindahkan kunci deployer (sekarang di `.env` lokal, hot wallet) ke hardware wallet / signer
  aman. Jangan pernah commit/print kunci.
- **Perintah**: impor kunci ke Ledger/Trezor atau buat signer baru dan transfer kepemilikan ke sana.
  Verifikasi: `cast wallet address --private-key <baru>`.
- **Biaya**: ~0.
- **Selesai bila**: admin ops tidak lagi butuh `.env` di mesin dev; kunci lama dinonaktifkan/dibuang.

## 2. [WAJIB] Audit pihak ketiga — 🧑
- **Apa**: kirim `docs/AUDIT_SCOPE.md` + repo (commit final) ke auditor. Perbaiki temuan High/Medium
  sebelum publik. Jalankan ulang Slither/Aderyn di mesin Anda.
- **Catatan**: kontrak SUDAH di mainnet (tertutup) tanpa audit — ini risiko yang diterima untuk uji
  terbatas (lihat `RISKS.md`). **Jangan buka allowlist sebelum audit.**
- **Biaya**: biaya auditor.
- **Selesai bila**: laporan audit bersih / temuan tertangani; jika butuh perubahan kontrak → redeploy
  (ulangi langkah deploy di DEPLOY.md, allowlist tetap aktif).

## 3. [WAJIB] Verifikasi kontrak di explorer — 🧑/🤖
- **Apa**: verifikasi semua kontrak di robin.etherscan.io (butuh API key v2) atau UI Blockscout.
- **Perintah**: lihat `MAINNET_SMOKE_RESULT.md` §"Verifikasi kontrak" (perintah + constructor args siap).
- **Biaya**: ~0 (butuh API key gratis dari robin.etherscan.io).
- **Selesai bila**: semua 7 kontrak "verified" di explorer.

## 4. [WAJIB] Buat Safe multisig (atau alternatif) — 🧑
- **Apa**: buat Safe{Wallet} di Robinhood Chain (chainId 4663). Jika Safe belum mendukung 4663, pakai
  alternatif multisig yang ada di 4663 (mis. deploy Safe singleton+factory sendiri, atau gnosis-safe
  via CLI), minimal 2-of-3 signer.
- **Perintah**: via app.safe.global bila 4663 didukung, atau deploy Safe contracts + `safe-cli`.
- **Biaya**: ~0.001 ETH (deploy Safe) bila self-deploy.
- **Selesai bila**: alamat multisig ada & bisa menandatangani tx di 4663. Set `MULTISIG` di `.env`.

## 5. [WAJIB] Hand over ke Timelock 48 jam — 🧑/🤖
- **Apa**: transfer ownership factory/priceReader/feeVault **dan router** ke `TimelockController` (48h)
  yang proposer/executor-nya = multisig.
- **Catatan kode**: `script/04_HandOver.s.sol` membaca `deployments/4663.json` dan mentransfer
  factory/priceReader/feeVault/**router** ke Timelock (router ditambahkan 2026-10-31).
- **Perintah**:
  ```
  export MULTISIG=<alamat Safe>
  forge script script/04_HandOver.s.sol:HandOver --rpc-url $RH_RPC_URL --broadcast --slow
  # lalu timelock harus acceptOwnership() pada tiap kontrak via op multisig terjadwal.
  ```
- **Biaya**: ~0.0005 ETH + 4× acceptOwnership.
- **Selesai bila**: `owner()` tiap kontrak == Timelock; multisig memegang proposer/executor.

## 6. [WAJIB] Review legal / geo-block / US persons — 🧑
- **Apa**: pembatasan sekuritas, larangan US persons (token saham Robinhood tidak untuk US persons),
  geo-blocking di frontend, ToS. Ini layer frontend/legal, bukan kontrak.
- **Selesai bila**: nasihat hukum diperoleh; geo-block & disclaimer siap di frontend.

## 7. [OPSIONAL/bertahap] Konfigurasi stock tambahan — 🧑/🤖
- **Apa**: allowlist stock lain (TSLA/AAPL/SPY/…) + set ref pool v3 + `router.setEthInPath` per stock.
- **Perintah per stock** (via multisig/timelock setelah handover):
  ```
  factory.setStock(<stock>, true, <poolV3 stock/USDG>, RefKind.USDG)
  priceReader.bumpCardinality(<pool>, 600)   # bila TWAP belum matang
  router.setEthInPath(<stock>, abi.encodePacked(WETH, 100, USDG, <feeStock>, <stock>))
  ```
- **Enumerasi**: scan event `PoolCreated` v3 Factory `0x1f7d…2EfA` untuk pasangan stock/USDG & stock/WETH.
- **Selesai bila**: tiap stock target allowlisted + TWAP tersedia + path ETH-in terkonfigurasi.

## 8. [WAJIB untuk publik] Indexer + frontend — 🧑/🤖
- **Apa**: indexer (Ponder/Envio) membaca event (`TokenLaunched`, `CurveTrade`, `Graduated`, `FeeTaken`,
  dll — lihat `libraries/Events.sol`) dari alamat mainnet; frontend memanggil `COURRouter` untuk
  buy/sell/buyWithETH dan menampilkan kurva/holders/fee.
- **Selesai bila**: UI bisa launch (saat allowlist dibuka), trade, dan menampilkan data real-time dari 4663.

## 9. [WAJIB] Monitoring & respons insiden — 🧑/🤖
- **Apa**: alert on-chain (graduasi, buyback, deviasi harga, fee), dashboard treasury, runbook insiden,
  dan kemampuan `setLaunchesPaused(true)` via multisig bila ada anomali (menghentikan launch baru;
  tidak menyentuh token lama).
- **Selesai bila**: alerting live + prosedur pause teruji di testnet/fork.

## 10. [WAJIB — LANGKAH TERAKHIR] Buka allowlist ke publik — 🧑 (via multisig/timelock)
- **Prasyarat**: langkah 1–6, 8, 9 selesai (audit bersih, ownership di timelock+multisig, verifikasi,
  legal, indexer/frontend, monitoring).
- **Apa**: matikan gating allowlist agar siapa pun bisa launch.
- **Perintah** (diajukan ke timelock oleh multisig, dieksekusi setelah 48 jam):
  ```
  factory.setLaunchAllowlistEnabled(false)
  ```
- **Biaya**: ~0.0002 ETH.
- **Selesai bila**: `launchAllowlistEnabled() == false`; peluncuran publik pertama berhasil & termonitor.

---

### Ringkasan wajib-sebelum-publik
Amankan kunci (1) → Audit (2) → Verifikasi (3) → Multisig (4) → Handover Timelock (5) → Legal (6) →
Indexer/Frontend (8) → Monitoring (9) → **baru** Buka allowlist (10). Langkah 7 (stock tambahan)
bertahap/opsional. Jangan lewati 2 dan 5 sebelum 10.
