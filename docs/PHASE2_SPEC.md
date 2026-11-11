# COUR Fase 2 — Spesifikasi (branch `phase2`, JANGAN merge/deploy)

> Status: **DRAFT di branch `phase2`**. Kontrak Fase 1 (`src/`) tetap **BEKU**
> (`audit-freeze-v1`). Dokumen ini merinci fitur Fase 2, apakah butuh perubahan
> kontrak, dampak audit, estimasi kerja, dan prioritas. Fitur yang **TIDAK** butuh
> perubahan kontrak sudah mulai dibangun di `phase2/` (notifier, screener, analytics).

## Ringkasan prioritas

| # | Fitur | Ubah kontrak? | Dampak audit | Estimasi | Prioritas |
|---|---|---|---|---|---|
| 1 | Notifikasi (Telegram/web push dari indexer) | **Tidak** | Tidak ada | 3–5 hari | **P0** (cepat, dampak besar) |
| 2 | Integrasi screener/aggregator (DexScreener/GeckoTerminal/GMGN) | **Tidak** (adapter) | Tidak ada | 5–8 hari | **P0** |
| 3 | Analytics/metrics lanjutan | **Tidak** | Tidak ada | 3–5 hari | **P1** |
| 4 | Limit order (keeper off-chain + order on-chain, tanpa oracle pihak ketiga) | **Ya** (kontrak order baru) | **Audit baru** (scope sedang) | 3–5 minggu | **P1** |
| 5 | Mode fee campuran (mis. 40% creator / 40% holders) | **Ya** (ubah FeeVault/Hook) | **Re-audit** area fee | 2–4 minggu | **P2** |
| 6 | LP berbayar (opsional) | **Ya** (lepaskan LP-burn) | **Re-audit besar** | 4–8 minggu | **P2/P3** |

> Aturan emas: fitur **tanpa perubahan kontrak** (1,2,3) bisa jalan **sebelum**
> audit publik dibuka karena tidak menyentuh `src/`. Fitur **dengan perubahan
> kontrak** (4,5,6) harus lewat `POST_AUDIT_PLAYBOOK` → redeploy bertag baru →
> audit — **tidak boleh** menumpang `audit-freeze-v1`.

---

## 1. Notifikasi — Telegram + Web Push (TANPA ubah kontrak) · P0

**Apa:** service yang mengubah event terindeks menjadi notifikasi real-time.
Sumber data = indexer Fase 1 (REST `/trades`, `/tokens`, event). Kanal:
- **Telegram** (bot) — channel publik + DM per-subscription.
- **Web Push** (VAPID / service worker di frontend) — "token X graduasi", "buyback
  dieksekusi", "trade besar > $N", "launch baru dari creator yang kamu ikuti".

**Rule engine:** aturan (jenis event, ambang, filter token/creator) → render pesan →
dedupe (per event id) → kirim ke kanal. Idempoten (tidak dobel saat restart) via
cursor `lastSeen` per rule.

**Kontrak:** tidak. **Audit:** tidak. **Estimasi:** 3–5 hari (bot + push + rule engine + tests).
**Dibangun di:** `phase2/notifier/` (lihat §Implementasi).

---

## 2. Integrasi screener & aggregator (TANPA ubah kontrak; ADAPTER) · P0

**Masalah:** COUR memakai **Uniswap v4** (PoolManager singleton, bukan kontrak
per-pair seperti v2/v3) dan **bonding curve** pra-graduasi (bukan pool sama sekali).
Screener (DexScreener, GeckoTerminal, GMGN) meng-index pola v2/v3 per-pair atau
butuh **adapter API** untuk v4. Jadi COUR tidak bisa "langsung ter-index"; kita
sediakan **adapter** yang mengekspos data COUR dalam skema yang mereka minta.

**Yang dibutuhkan screener dari pool v4 + hook COUR:**
- **Pra-graduasi (bonding curve):** ekspos kurva sebagai *synthetic pair*:
  `baseToken` = token COUR, `quoteToken` = stock (mis. NVDA/USDG), harga = `vS/vT`
  (dari curve accounting), likuiditas virtual, volume dari event `CurveTrade`.
- **Pasca-graduasi (pool v4):** `poolId`, `token0/token1`, fee tier (0), harga dari
  curve-accounting / TWAP (`COURPriceReader`), reserve in-range, LP = **burned**
  (owner DEAD, positionId 0) → tandai "liquidity locked/burned".
- **Event feed:** daftar swap (buy/sell) dengan `txHash`, `blockNumber`, `logIndex`,
  harga, jumlah, maker — persis yang dibutuhkan skema "events" DexScreener.

**Skema adapter (yang kita sediakan):**
- **DexScreener-style**: `/screener/latest/dex/pairs`, `/screener/assets`,
  `/screener/events` (format "Decentralized Exchange" mereka: `pair`, `asset`,
  `swap`/`join`/`exit`, `block`).
- **GeckoTerminal/CoinGecko on-chain**: endpoint `/screener/geckoterminal/{network}/pools`,
  `.../tokens`, `.../ohlcv` sesuai skema partner mereka.
- **GMGN**: tidak ada spec publik stabil; sediakan feed generik (`/screener/pairs`,
  `/screener/trades`) + hubungi mereka untuk whitelist.

**Catatan integrasi nyata:** masing-masing screener butuh **pendaftaran manual**
(form partner + review) — adapter ini membuat COUR *memenuhi syarat* teknis.
DexScreener & GeckoTerminal mendukung chain kustom bila ada adapter yang stabil +
RPC publik. Perlu: URL adapter publik, dokumentasi chain 4663, kontak partner.

**Kontrak:** tidak (semua dari data terindeks + read on-chain). **Audit:** tidak.
**Estimasi:** 5–8 hari. **Dibangun di:** `phase2/screener/`.

---

## 3. Analytics / metrics lanjutan (TANPA ubah kontrak) · P1

**Apa:** agregasi di atas data indexer — volume per interval, holder growth,
retensi trader, distribusi fee (creator/holders/buyback/platform), funnel
launch→graduasi, "top movers". Output: REST `/analytics/*` untuk dashboard internal
+ frontend. Murni turunan dari event; tidak ada angka yang difabrikasi.

**Kontrak:** tidak. **Audit:** tidak. **Estimasi:** 3–5 hari. **Dibangun di:** `phase2/analytics/`.

---

## 4. Limit order (keeper off-chain + order on-chain, TANPA oracle pihak ketiga) · P1

**Desain (butuh kontrak baru, BUKAN ubah kontrak beku):**
- Kontrak `COURLimitOrderBook` **terpisah** (tidak menyentuh Factory/Vault/Hook beku).
  User men-deposit stock/token + menaruh order `{token, side, triggerPriceX, amount,
  minOut, expiry}`. Dana di-escrow di order book.
- **Tanpa oracle pihak ketiga:** harga acuan = **curve accounting on-chain** (pra-grad,
  `curve.quoteBuy/Sell`) atau **TWAP milik COUR** (`COURPriceReader`, pasca-grad) —
  sumber yang sudah ada & teraudit, bukan Chainlink/pihak luar.
- **Keeper off-chain** (service di `phase2/`, nanti): memantau harga, saat trigger
  tercapai memanggil `fillOrder(id)`. Kontrak **meng-verifikasi** sendiri harga saat
  fill (`require` terhadap curve/TWAP) sehingga keeper **tidak dipercaya** — keeper
  hanya "menekan tombol"; kontrak yang menegakkan harga & slippage. Insentif keeper =
  fee kecil dari order.
- Eksekusi fill = kontrak memanggil `COURRouter.buy/sell` atau swap pool v4 atas nama
  user (order book sebagai perantara, approve ke router).

**Kenapa kontrak baru, bukan ubah yang beku:** menjaga `audit-freeze-v1` utuh; order
book adalah modul add-on yang bisa di-pause/diganti tanpa risiko ke core.

**Dampak audit:** audit baru untuk `COURLimitOrderBook` (escrow, verifikasi harga,
reentrancy, keeper incentive, expiry/refund). Scope sedang.
**Estimasi:** 3–5 minggu (kontrak + test + keeper + UI). **Prioritas:** P1.

---

## 5. Mode fee campuran (mis. 40% creator / 40% holders / 20% buyback) · P2

**Sekarang:** `creatorMode` enum (CREATOR | HOLDERS | BUYBACK | BUYBACK_BURN) —
satu tujuan per token. **Fase 2:** split fee ke beberapa penerima dengan bobot bps.

**Butuh ubah kontrak:** `COURFeeVault` (akuntansi split per token: array
`{recipientKind, bps}` dengan Σbps = feeBps) + `COURFactory.createToken` (terima
konfigurasi split) + `COURHook`/token (bookkeeping HOLDERS tetap). Ini **menyentuh
jalur fee inti** → **re-audit** area fee + konservasi (identitas "semua fee terbagi
habis, tak ada yang hilang/dobel").

**Risiko:** rounding saat split (harus favor-protocol, konsisten dgn CurveMath),
interaksi dgn dividend HOLDERS (beforeBalanceChange), dan migrasi enum→weights.
**Estimasi:** 2–4 minggu (kontrak + fuzz identitas split + test). **Prioritas:** P2.

---

## 6. LP berbayar (opsional) · P2/P3 — konsekuensi besar

**Sekarang:** graduasi men-*seed* pool full-range dan **membakar LP** (owner DEAD,
tak ada removal) → "liquidity locked forever", tidak ada LP fee (fee 0).

**Jika LP berbayar diaktifkan:** LP tidak lagi dibakar; pihak bisa menambah likuiditas
& menarik fee. Konsekuensi:
- **Kontrak:** lepaskan invariant "LP burned" (graduasi mint posisi ke pemilik nyata,
  bukan DEAD), tambah manajemen posisi (add/remove/collect), set LP fee tier > 0,
  tracking kepemilikan LP. Ini **membatalkan** salah satu jaminan keamanan inti Fase 1.
- **Audit:** **re-audit besar** — surface area baru (impermanent loss, rug via LP
  withdrawal, fee accounting), plus revisi klaim UI "burned forever".
- **Legal/kepercayaan:** "LP bisa ditarik" mengubah profil risiko rug secara signifikan.

**Rekomendasi:** jadikan **mode per-token opsional** (creator memilih "burned LP"
default vs "managed LP"), JANGAN mengubah token lama. Prioritas **P3** (paling akhir,
paling berisiko audit). **Estimasi:** 4–8 minggu.

---

## Implementasi di branch `phase2/`

Yang **tidak butuh kontrak** sudah dibangun (TypeScript, test `node --test`):

```
phase2/
  package.json            # workspace Fase 2 (node:test, no network in unit tests)
  shared/indexer-client.ts# klien REST indexer Fase 1 (dipakai semua service)
  notifier/               # #1 — rule engine + Telegram + web push (+ tests)
  screener/               # #2 — adapter DexScreener/GeckoTerminal + mapper (+ tests)
  analytics/              # #3 — agregasi metrics dari event (+ tests)
```

Fitur dengan perubahan kontrak (#4,#5,#6) **belum** ditulis sebagai kontrak di sini —
hanya dispesifikasikan di atas; implementasinya menunggu keputusan pasca-audit.
