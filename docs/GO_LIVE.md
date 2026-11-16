# GO LIVE — Dari Deploy Tertutup ke Publik (COUR, Robinhood Chain 4663)

> Kondisi SEKARANG: kontrak live di mainnet, **allowlist launch AKTIF** (hanya deployer yang bisa launch),
> **owner = Safe 2-of-3 `0xDca6…7fA2`** (handover opsi (a) SELESAI 2026-11-16 — tx
> `0xf93b0270b7c3bff8da1fcbe22a15dcd352aec8d1f7eed7cf71bbe2edec121b15`; `DEPLOYER_PK` sudah dihapus dari
> `.env`), param produksi 4000/60000, smoke test sukses (lihat `MAINNET_SMOKE_RESULT.md`). Dokumen ini
> adalah urutan langkah menuju pembukaan publik. Tandai: **[WAJIB]** sebelum publik, **[OPSIONAL]** boleh
> menyusul. "Siapa": 🧑 manusia / 🤖 Claude Code. Biaya gas sangat murah di 4663 (~0.0005 ETH/op).

Alamat: factory `0x8e27C8712FD3Ba21374F8b48A82aAf07E2838D42`, feeVault
`0xE412C7e137b3132b454ca38739ad981F9c90b4EB`, priceReader `0x2e1F9eC3dc1064C31F16a7CebC304b7915d0d4dD`,
router `0x24Caa2B0aa97da71C9359F361e3dD43c2a7B1449`, hook `0xFC1bC2f2C0cEA16509dE1C906C8E5a0a322A20cc`.
> **CATATAN**: alamat di atas usang. Deployment AKTIF ada di `deployments/4663.json` / `AUDIT_REPORT.md §5`.

---

## 0. [PENTING] Status deployment vs kode — ✅ final deploy DONE (2026-11-05)
- **Deployment mainnet AKTIF** = tag **`audit-freeze-v1`** (`deployments/4663.json`). Memuat **C-1/L-1/I-1 +
  L-2/L-3/L-4**. Alamat final di §"Alamat (FINAL)" di bawah. **Semua 7 kontrak terverifikasi** di
  robin.etherscan.io (langkah 3 ✅, `docs/VERIFICATION.md`).
- Allowlist **AKTIF**, **owner = Safe 2-of-3** `0xDca6…7fA2` (✅ handover opsi (a) selesai 2026-11-16;
  `owner()==Safe`, `pendingOwner()==0` di 4 kontrak). Dua deployment lama di-pause & DEPRECATED.
- **Sudah selesai:** amankan key (1 ✅ — `DEPLOYER_PK` dihapus), multisig (4 ✅ — Safe 2-of-3),
  handover ke Safe (opsi a ✅). **Sisa menuju publik:** audit independen (2), Timelock 48h (5), legal (6),
  indexer/frontend (8), monitoring (9) → baru buka allowlist (10). Jika audit minta perubahan →
  `audit-fix-v1` + redeploy (`docs/audit/POST_AUDIT_PLAYBOOK.md`).

### Alamat (FINAL, tag audit-freeze-v1)
factory `0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C`, feeVault `0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76`,
hook `0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC`, router `0x835Afd54F9BA20b18b6807B44886123E85A586f9`,
priceReader `0xF7C914E7B7580a7653DcC3b7574bf041F615e359`, curveImpl `0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00`,
graduationImpl `0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7`.

---

## 1. [✅ WAJIB — SELESAI 2026-11-16] Amankan private key deployer — 🧑
- **Status: SELESAI** — kunci deployer di-backup ke hardware wallet dan **`DEPLOYER_PK` sudah dihapus
  dari `.env`** setelah handover ke Safe terbukti on-chain.
- **Hasil**: admin ops **tidak lagi** butuh `.env`/`DEPLOYER_PK` — semua lewat Safe 2-of-3
  (MetaMask `script/safe/signer.html`, owner tanda tangan `eth_signTypedData_v4`). Tak ada CI/layanan
  yang bergantung pada `DEPLOYER_PK`.

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

## 4. [✅ WAJIB — SELESAI] Buat Safe multisig + handover owner ke Safe (opsi a) — 🧑
- **Status: SELESAI** — Safe v1.4.1 2-of-3 `0xDca6d36E44E848a7C4088Fb5d12FfDEd22EA7fA2` live di 4663
  (`07_DeploySafe`). Karena `app.safe.global` tak mendukung 4663, Safe dikendalikan tanpa UI via
  `cast`/MetaMask (`script/safe/`). `MULTISIG` sudah di `.env` + `deployments/4663.json`.
- **Owner handover (opsi a) SELESAI 2026-11-16** — Safe meng-`acceptOwnership()` keempat kontrak
  (MultiSend, safeTxHash `0x50e1…6ed1`), tx `0xf93b0270b7c3bff8da1fcbe22a15dcd352aec8d1f7eed7cf71bbe2edec121b15`
  (block 115869100). `owner()==Safe`, `pendingOwner()==0` terverifikasi on-chain.

## 5. [WAJIB — belum] Hand over ke Timelock 48 jam (sebelum buka publik) — 🧑/🤖
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
