# Hasil Smoke Test Mainnet — COUR (Robinhood Chain, chainId 4663)

> ⚠️ **DEPRECATED DEPLOYMENT.** Kontrak yang di-smoke-test di dokumen ini (factory
> `0x8e27C871…8D42`) diganti pada 2026-10-31 oleh deployment ber-perbaikan-audit (fix CRITICAL
> self-transfer C-1). **Deployment AKTIF: factory `0x2EA5E113f88A1C79F1A489fbef789578f10a070A`** —
> lihat `deployments/4663.json` + `docs/audit/AUDIT_REPORT.md`. Dokumen ini disimpan sebagai catatan
> bahwa alur smoke (launch→graduasi→LP NFT ke DEAD→buyback→claim) berhasil end-to-end di mainnet.


> Dieksekusi 2026-10-30 dengan wallet deployer `0x1eb25d02fc7C5487D4648a602c355dBC2301030b`.
> Budget 0.005 ETH; terpakai total **~0.00271 ETH (~$6.4)** — murni gas hanya **~0.00051 ETH (~$1.2)**;
> sisanya ~0.0022 ETH adalah swap ke NVDA yang kini terkunci di LP yang dibakar + token CTEST.
> Explorer: https://robin.etherscan.io (utama), https://robinhoodchain.blockscout.com (cadangan).

## Alamat kontrak (live di mainnet)

| Kontrak | Alamat | Tx deploy |
|---|---|---|
| COURFactory | `0x8e27C8712FD3Ba21374F8b48A82aAf07E2838D42` | `0x706db4a8755c13a78f2a6115016824ca06dca3739d6d560a8713cffda0e11b95` |
| COURFeeVault | `0xE412C7e137b3132b454ca38739ad981F9c90b4EB` | `0x30c09b199c9fb2eafcf217f1e514324b34ec27fce524c41ff26134a3c6dc72ba` |
| COURHook | `0xFC1bC2f2C0cEA16509dE1C906C8E5a0a322A20cc` | `0xd91b78c8a94f8b3f5a4a3ac08693c2d8ecea439ebd8e633ec1e200ed13fb1b6c` |
| COURRouter | `0x24Caa2B0aa97da71C9359F361e3dD43c2a7B1449` | `0xda3253f075ff57d4d8fb9006200fe80c30a429e771d62811127582d9e42fba2a` |
| COURPriceReader | `0x2e1F9eC3dc1064C31F16a7CebC304b7915d0d4dD` | `0x2c6c3d781ad96c7aee936fde02bea03b050b31d5cf759b7caedfffa0172b7aa8` |
| COURCurve (impl) | `0x5C18Dc68DC62EBDE7172D6831FAeBAc378AEE3B1` | `0x90bb25926d0896ca95b3df24661c349924ada4017511104b197af00619b6fdd3` |
| GraduationImpl | `0x60b1b7d2bb873e91420c7f4be2d39ca89bb4fe54` | `0x35b7b6ab88231d27d56cbc7b3f71c0631fa1be839d65293211d6af870de6694c` |

Explorer alamat: `https://robin.etherscan.io/address/<alamat>`. Deployment record: `deployments/4663.json`.

## Langkah smoke test (semua sukses on-chain)

| # | Langkah | Angka | Bukti |
|---|---|---|---|
| 1 | Deploy core (01_DeployCore) | ~0.0004 ETH gas | 9 tx, "ONCHAIN EXECUTION COMPLETE & SUCCESSFUL" |
| 2 | Configure NVDA + param uji 1/15 + allowlist(deployer) + path WETH→USDG→NVDA (02) | ~0.00001 ETH | `startMcUsd=1, gradMcUsd=15, stockAllowed(NVDA)=true` terverifikasi |
| 3 | Swap ETH→USDG→NVDA (05a) | 0.0022 ETH → **0.0242 NVDA** | tx `0x044c0f06…` + path exactInput |
| 4 | Launch CTEST (fee 5%, BUYBACK_BURN, initial buy 0.0005 NVDA) | token `0xB9b094EDbf737749a904b660B4Fb3c7bED626DE7`, curve `0x4aC9878A706C2e361198c663C86D50337146B8a0` | 05a |
| 5 | Buy kecil + 1 sell (setelah jendela 5 dtk) + **buy menembus graduation** | refund sisa | 05b |
| 6 | **Graduasi + LP NFT ke DEAD** | positionId **4080369**, `ownerOf == 0x…dEaD` ✓; pool: 205.213.096 token + 0.0144 NVDA | Graduated event + `ownerOf` dicek on-chain |
| 7 | Creator buyback (BUYBACK_BURN) | 0.000144 NVDA → **2.031.812 token dibakar ke DEAD** | tx 05b; `DEAD` memegang 2.031.812 CTEST |
| 8 | Swap pool 2 arah via COURRouter | buy lalu sell | 05b |
| 9 | claimPlatform → treasury | 0.000192 NVDA | 05b |
| 10 | Restore param 4000/60000 + minBuybackUsd 50 (06) | terverifikasi on-chain | tx `0x2c98c12e…` |

Tx utama smoke: launch `0x044c0f0624834d8e2f35b6527469ae427384b793a302cc601a966f8251ef66ae`,
trade/graduasi `0x5de4d5cfbd59f6ab530a00f66d7d62bad5a67603bcb78509fa972f8d75828786` (dan 11 tx lain),
restore `0x2c98c12ec0ffd5dbad16dd8d31fe39d5bf21ba7c90504eef4db175c36f7c1ff9`.
Link: `https://robin.etherscan.io/tx/<hash>`.

## Catatan positionId
Script `05b` mencetak `4080323` di console — itu dari fase SIMULASI forge. Karena `--slow` menambang
pembacaan `nextTokenId()` dan tx graduasi di blok berbeda, pengguna v4 lain menaikkan counter di antaranya.
`GraduationImpl` membaca `nextTokenId()` DI DALAM tx graduasi (atomik), jadi **positionId sebenarnya =
4080369** (dari event `Graduated`), dan `ownerOf(4080369) == 0x…dEaD` sudah dicek on-chain. LP benar-benar
dibakar.

## Status akhir
- Param launch: **4000 / 60000** (produksi), minBuybackUsd **50** — sudah dikembalikan.
- Allowlist launch: **AKTIF** (hanya deployer yang di-allowlist).
- Owner semua kontrak: **deployer EOA** (belum handover).
- Sisa saldo deployer: **0.002289720409344 ETH** (~$5.4).

## Verifikasi kontrak — BELUM (butuh aksi manusia)
Verifikasi otomatis gagal dari lingkungan ini: **Blockscout di belakang Cloudflare** (API mengembalikan
halaman challenge) dan **Etherscan v2 butuh API key** (tidak tersedia). Jalankan dengan key Anda:
```
# Etherscan v2 (robin.etherscan.io), chainid=4663:
forge verify-contract 0x60b1b7d2bb873e91420c7f4be2d39ca89bb4fe54 src/GraduationImpl.sol:GraduationImpl \
  --verifier etherscan --verifier-url 'https://api.etherscan.io/v2/api?chainid=4663' \
  --etherscan-api-key $ETHERSCAN_API_KEY --chain 4663 --watch
```
Constructor args (untuk `--constructor-args $(cast abi-encode ...)`):
- COURPriceReader `constructor(address,address,address)` = (deployer, USDG `0x5fc5…d168`, WETH `0x0Bd7…AD73`)
- COURFeeVault `constructor(address,address,address)` = (deployer, treasury=deployer, PoolManager `0x8366…0951`)
- COURCurve `constructor(address,address)` = (factory `0x8e27…8D42`, feeVault `0xE412…b4EB`)
- GraduationImpl `constructor()` = (tanpa argumen)
- COURHook `constructor(address,address,address)` = (PoolManager, factory, feeVault) — CREATE2
- COURFactory `constructor(address,address,address,address,address,address,address,address)` =
  (deployer, PoolManager, PositionManager `0x58da…4fA7`, hook, feeVault, priceReader, curveImpl, graduationImpl)
- COURRouter `constructor(address,address,address,address,address)` =
  (deployer, PoolManager, factory, SwapRouter02 `0xCaf6…5cb2`, WETH)

Alternatif: verifikasi lewat UI Blockscout di browser (menangani Cloudflare) dengan "Standard JSON input"
dari `out/`. Catat status di sini setelah berhasil.
