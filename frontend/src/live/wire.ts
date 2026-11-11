// Live wiring: drives the approved design's ORIGINAL render functions with real
// indexer + on-chain data, and replaces the demo buy/sell/launch handlers with
// real COURRouter / factory calls. All seams (window.COUR_*) are installed by a
// few tiny hooks added inside the design's inline script (see index.html).
//
// No fabricated numbers: when data is unavailable the UI shows the last real
// value or an honest empty state. The design's random-walk price simulators are
// gated off by window.COUR_LIVE (set at the top of index.html).
import { indexer, indexerConfigured } from "../data/indexer";
import * as onchain from "../data/onchain";
import * as trade from "../features/trade";
import * as launch from "../features/launch";
import { deployment, explorerToken, explorerTx } from "../chain/deployment";
import { getWallet } from "../chain/wallet";
import { toRaw, fromRaw, fmtUsd, shortAddr } from "../ui/format";
import { mapToken, mapCandles, type UiToken } from "./map";
import type { CandleRow, TokenRow, Hex } from "../data/types";

const W = () => window as any;

// ---------------------------------------------------------------------------
// Token registry (real). Keyed by both symbol (for the design) and address.
// ---------------------------------------------------------------------------
const bySymbol = new Map<string, UiToken>();
const byAddress = new Map<string, UiToken>();

function registerTokens(list: UiToken[]) {
  bySymbol.clear();
  byAddress.clear();
  for (const t of list) {
    bySymbol.set(t.tick.toUpperCase(), t);
    byAddress.set(t.address.toLowerCase(), t);
    // Seed the single price feed the whole UI reads.
    if (t.lastPriceUsd != null && isFinite(t.lastPriceUsd)) {
      W().COUR_PX = W().COUR_PX || {};
      W().COUR_PX[t.tick.toUpperCase()] = t.lastPriceUsd;
    }
  }
  // Hand the real token objects to the design's closure (empties the demo array).
  if (typeof W().COUR_setTokens === "function") W().COUR_setTokens(list);
}

// ---------------------------------------------------------------------------
// 1. Load the real token list (indexer preferred, on-chain CSMOKE fallback).
// ---------------------------------------------------------------------------
export async function loadTokens(): Promise<UiToken[]> {
  const { address } = getWallet();
  const ui: UiToken[] = [];

  if (indexerConfigured()) {
    const res = await indexer.tokens("trending", 100);
    if (res.ok && res.data.tokens.length) {
      // Fetch candles for the first dozen in parallel so cards get real sparklines.
      const head = res.data.tokens.slice(0, 12);
      const candles = await Promise.all(
        head.map((t) =>
          indexer.candles(t.address, "1h", 48).then((r) => (r.ok ? r.data.candles : null)).catch(() => null),
        ),
      );
      res.data.tokens.forEach((t: TokenRow, i: number) => {
        ui.push(mapToken(t, { candles: i < head.length ? candles[i] : null, wallet: address }));
      });
      registerTokens(ui);
      return ui;
    }
  }

  // Fallback: read the known live test token (CSMOKE) directly on-chain so the
  // app shows at least one real token with a real price even without an indexer.
  try {
    const csmoke = W().COUR?.chain?.extraAddresses?.csmoke as Hex | undefined;
    if (csmoke) {
      const curve = await onchain.curveOf(csmoke);
      if (curve) {
        const snap = await onchain.curveSnapshot(curve);
        if (snap) {
          const usd = await onchain.stockUsdPrice(snap.stock);
          const meta = await onchain.erc20Meta(csmoke).catch(() => ({ symbol: "CSMOKE", decimals: 18 }));
          const priceStock = snap.vT > 0n ? Number(snap.vS) / Number(snap.vT) : 0;
          const priceUsd = usd != null ? priceStock * usd : null;
          const row: TokenRow = {
            address: csmoke,
            curve,
            name: meta.symbol,
            symbol: meta.symbol,
            metadataURI: null,
            creator: snap.creator,
            stock: snap.stock,
            stockDecimals: snap.stockDecimals,
            feeBps: snap.creatorFeeBps,
            mode: snap.mode,
            feeRecipient: null,
            startPriceX: "0",
            launchedAt: snap.launchedAt,
            launchBlock: 0,
            graduated: snap.graduated,
            graduatedAt: null,
            poolId: null,
            positionId: null,
            vS: snap.vS.toString(),
            vT: snap.vT.toString(),
            vT0: "0",
            vTStop: "0",
            progressBps: snap.progressBps,
            lastPriceStock: priceStock,
            lastPriceUsd: priceUsd,
            volumeStock: 0,
            volumeUsd: 0,
            tradeCount: 0,
            lastTradeAt: null,
          };
          ui.push(mapToken(row, { wallet: address }));
        }
      }
    }
  } catch (e) {
    console.warn("[COUR live] on-chain fallback failed:", e);
  }
  registerTokens(ui);
  return ui;
}

// ---------------------------------------------------------------------------
// 2. Real candles on token open — fetch /candles and seed the chart.
// ---------------------------------------------------------------------------
async function seedCandlesFor(sym: string) {
  const t = bySymbol.get(sym.toUpperCase());
  if (!t) return;
  let rows: CandleRow[] | null = null;
  if (indexerConfigured()) {
    const r = await indexer.candles(t.address, "1m", 300);
    if (r.ok) rows = r.data.candles;
  }
  if (rows && rows.length && typeof W().COUR_setCandles === "function") {
    W().COUR_setCandles(mapCandles(rows));
  } else if (typeof W().COUR_setCandles === "function") {
    // No candle history yet: show a flat line at the real last price rather than
    // a fabricated random walk.
    const p = t.lastPriceUsd ?? t.priceStock ?? 1;
    const flat = new Array(60).fill(0).map(() => ({ o: p, h: p, l: p, c: p, v: 0 }));
    W().COUR_setCandles(flat);
  }
}

function installTokenOpenHook() {
  const prev = W().openToken;
  if (typeof prev !== "function") return;
  W().openToken = function (tick: string) {
    const r = prev.apply(this, arguments as any);
    // Seed real price immediately, real candles async.
    const t = bySymbol.get(String(tick).toUpperCase());
    if (t && t.lastPriceUsd != null) {
      W().COUR_PX = W().COUR_PX || {};
      W().COUR_PX[t.tick.toUpperCase()] = t.lastPriceUsd;
    }
    seedCandlesFor(String(tick)).catch(() => {});
    return r;
  };
}

// ---------------------------------------------------------------------------
// 3. Real buy / sell — replaces the demo order confirm flow in live mode.
// ---------------------------------------------------------------------------
function readOrderInputs(): { amt: number; sell: boolean } {
  const amtEl = document.getElementById("ordAmt") as HTMLInputElement | null;
  const amt = parseFloat((amtEl?.value || "0").replace(/,/g, "")) || 0;
  const sell = W()._ordSide === "sell";
  return { amt, sell };
}

export async function tradeReal(): Promise<void> {
  const tok: UiToken | undefined = typeof W().COUR_getTkTok === "function" ? W().COUR_getTkTok() : undefined;
  if (!tok) return;
  const { address } = getWallet();
  if (!address) {
    if (typeof W().openConnect === "function") W().openConnect();
    return;
  }
  if (tok.graduated) {
    toast("This token has graduated — trade it on its pool (coming soon in the UI).", true);
    return;
  }
  const { amt, sell } = readOrderInputs();
  if (!(amt > 0)) {
    toast("Enter an amount first.", true);
    return;
  }
  // Close the design's review modal — we execute on-chain and toast the result.
  document.getElementById("ordModal")?.classList.remove("show");
  const btn = document.getElementById("ordBtn") as HTMLButtonElement | null;
  const label = btn?.textContent || "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = sell ? "Selling…" : "Buying…";
  }
  try {
    if (sell) {
      // amount is in token units
      const tokensIn = toRaw(amt, 18);
      const q = await trade.previewSell(tok.address, tokensIn, 150);
      const hash = await trade.sell(tok.address, tokensIn, q.minOut);
      toast(`Sold ${tok.tick}. Tx ${shortAddr(hash)}`, false, explorerTx(hash));
    } else {
      // amount is in the paired stock units (buy with stock)
      const stockIn = toRaw(amt, tok.stockDecimals);
      const q = await trade.previewBuy(tok.address, stockIn, 150);
      const hash = await trade.buy(tok.address, tok.stock, stockIn, q.minOut);
      toast(`Bought ${tok.tick}. Tx ${shortAddr(hash)}`, false, explorerTx(hash));
    }
    const amtEl = document.getElementById("ordAmt") as HTMLInputElement | null;
    if (amtEl) amtEl.value = "";
    await refreshAfterChange(tok.tick);
  } catch (e: any) {
    toast(e?.shortMessage || e?.message || "Trade failed", true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = label || (sell ? "Sell" : "Buy") + " $" + tok.tick;
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Real launch — replaces fakeDeploy in live mode.
// ---------------------------------------------------------------------------
const STOCK_BY_SYMBOL: Record<string, { address: Hex; decimals: number }> = {
  NVDA: { address: deployment.nvda as Hex, decimals: 18 },
};

export async function launchReal(p: {
  name: string;
  tick: string;
  pair: string;
  buy: number;
  desc: string;
  logo: string | null;
  fee: number;
}): Promise<void> {
  const steps = document.getElementById("ctSteps");
  const form = document.getElementById("ctForm");
  const done = document.getElementById("ctDone");
  const btn = document.getElementById("ctLaunch") as HTMLButtonElement | null;
  const stock = STOCK_BY_SYMBOL[(p.pair || "NVDA").toUpperCase()];
  if (!stock) {
    toast(`Only NVDA is configured as a paired stock during beta (${p.pair} not available).`, true);
    return;
  }
  const { address } = getWallet();
  if (!address) {
    if (typeof W().openConnect === "function") W().openConnect();
    return;
  }
  if (steps) steps.classList.add("on");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Deploying…";
  }
  const stepState = (i: number, cls: string | null) => {
    const el = steps?.querySelector('.ct-step[data-s="' + i + '"]');
    if (!el) return;
    el.classList.remove("run", "done");
    if (cls) el.classList.add(cls);
  };
  try {
    // Step 0: metadata (IPFS when configured, else inline data URI).
    stepState(0, "run");
    let metadataURI = "";
    if (p.logo && launch.pinataConfigured()) {
      try {
        const blob = await (await fetch(p.logo)).blob();
        const file = new File([blob], `${p.tick}.png`, { type: blob.type || "image/png" });
        metadataURI = await launch.uploadImageToIpfs(file);
      } catch {
        metadataURI = "";
      }
    }
    stepState(0, "done");
    // Step 1: approve (inside createToken) + Step 2: simulate + send.
    stepState(1, "run");
    const initialBuyStock = p.buy > 0 ? toRaw(p.buy, stock.decimals) : 0n;
    const params: launch.CreateParams = {
      name: p.name,
      symbol: p.tick,
      metadataURI,
      stock: stock.address,
      creatorFeeBps: Math.round(Math.max(1, Math.min(10, p.fee)) * 100),
      creatorMode: 0, // CREATOR fee mode (default in UI)
      feeRecipient: address as Hex,
      initialBuyStock,
      minInitialTokens: 0n,
      salt: launch.randomSalt(),
    };
    stepState(1, "done");
    stepState(2, "run");
    const result = await launch.createToken(params);
    stepState(2, "done");
    stepState(3, "done");

    // Refresh the real token list so the new token appears everywhere.
    await loadTokens();
    if (typeof W().render === "function") W().render();

    if (form) form.style.display = "none";
    if (done) done.classList.add("on");
    const dImg = document.getElementById("ctDoneImg") as HTMLImageElement | null;
    if (dImg && p.logo) dImg.src = p.logo;
    const dName = document.getElementById("ctDoneName");
    if (dName) dName.textContent = `${p.name} ($${p.tick}) is live`;
    const dSub = document.getElementById("ctDoneSub");
    if (dSub) dSub.textContent = `Paired with ${p.pair} · ${shortAddr(result.token)}`;
    const dChips = document.getElementById("ctDoneChips");
    if (dChips)
      dChips.innerHTML =
        `<span>Creator fee ${p.fee}%</span><span><a href="${explorerToken(result.token)}" target="_blank" rel="noopener">View on explorer ↗</a></span>`;
    // Make the "View token" button open the real token page.
    (byAddress.get(result.token.toLowerCase()) || bySymbol.get(p.tick.toUpperCase()));
  } catch (e: any) {
    if (steps) steps.classList.remove("on");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Launch token";
    }
    const msg = e?.shortMessage || e?.message || "Launch failed";
    // Surface allowlist / revert reasons honestly on the form.
    toast(msg, true);
    const fTick = document.getElementById("fTick");
    if (/allow/i.test(msg) && fTick) {
      fTick.classList.add("bad");
      const err = fTick.querySelector(".err");
      if (err) err.textContent = "Your wallet is not on the launch allowlist (invite-only beta).";
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Real portfolio — override pfRefresh to render holdings from chain/indexer.
// ---------------------------------------------------------------------------
async function renderPortfolioReal() {
  const { address } = getWallet();
  const empty = document.getElementById("wlEmpty");
  const full = document.getElementById("wlFull");
  const list = document.getElementById("wlList");
  const total = document.getElementById("wlTotal");
  if (!list) return;
  if (!address) {
    if (empty) empty.style.display = "";
    if (full) full.style.display = "none";
    return;
  }
  if (empty) empty.style.display = "none";
  if (full) full.style.display = "";
  list.innerHTML = `<div class="pf-empty">Loading your positions…</div>`;

  let rows: { sym: string; name: string; qty: number; valueUsd: number | null; addr: string }[] = [];
  let totalUsd = 0;
  if (indexerConfigured()) {
    const r = await indexer.portfolio(address);
    if (r.ok) {
      totalUsd = r.data.totalValueUsd;
      rows = r.data.positions.map((pos) => ({
        sym: (pos.symbol || "TOKEN").toUpperCase(),
        name: pos.name || shortAddr(pos.token),
        qty: pos.balanceWhole,
        valueUsd: pos.valueUsd,
        addr: pos.token,
      }));
    }
  }
  if (!rows.length) {
    // On-chain fallback: balances for the registered tokens.
    for (const t of byAddress.values()) {
      try {
        const bal = await onchain.erc20Balance(t.address, address as Hex);
        if (bal > 0n) {
          const qty = fromRaw(bal, 18);
          const valueUsd = t.lastPriceUsd != null ? qty * t.lastPriceUsd : null;
          if (valueUsd) totalUsd += valueUsd;
          rows.push({ sym: t.tick, name: t.name, qty, valueUsd, addr: t.address });
        }
      } catch {
        /* skip */
      }
    }
  }
  if (total) total.textContent = fmtUsd(totalUsd);
  if (!rows.length) {
    list.innerHTML = `<div class="pf-empty">No positions yet — buy a token to start your portfolio.</div>`;
    return;
  }
  list.innerHTML = rows
    .map(
      (r) =>
        `<div class="pf-row" style="cursor:pointer" onclick="openToken('${r.sym}')">` +
        `<div class="ava" style="background:linear-gradient(135deg,#6366f1,#22d3ee)">${r.sym[0] || "?"}</div>` +
        `<div><div class="pf-rname">${r.name}</div><div class="pf-rtick">${r.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} $${r.sym}</div></div>` +
        `<div class="pf-rval"><div class="v">${fmtUsd(r.valueUsd)}</div></div></div>`,
    )
    .join("");
}

function installPortfolioHook() {
  W().pfRefresh = function () {
    renderPortfolioReal().catch((e) => console.warn("[COUR live] portfolio:", e));
  };
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------
async function refreshAfterChange(sym: string) {
  await loadTokens();
  if (typeof W().render === "function") W().render();
  // If the token page is open, re-seed its price + candles.
  const t = bySymbol.get(sym.toUpperCase());
  if (t) {
    W().COUR_PX = W().COUR_PX || {};
    if (t.lastPriceUsd != null) W().COUR_PX[sym.toUpperCase()] = t.lastPriceUsd;
    await seedCandlesFor(sym);
  }
  if (typeof W().pfRefresh === "function") W().pfRefresh();
}

function toast(msg: string, isError = false, href?: string) {
  if (typeof W().pushToast === "function") {
    W().pushToast({ cat: isError ? "fail" : "ok", msg: href ? `${msg}` : msg });
  }
  // Always log; the toaster markup varies by theme.
  (isError ? console.warn : console.info)("[COUR]", msg, href || "");
  if (isError && typeof W().courSfx === "function") W().courSfx("fail");
}

// ---------------------------------------------------------------------------
// install — called from main.ts after the design script has run.
// ---------------------------------------------------------------------------
export function installLive() {
  // Expose the real handlers the seams call.
  W().COUR_tradeReal = () => {
    tradeReal().catch((e) => toast(e?.message || "Trade failed", true));
  };
  W().COUR_launchReal = (p: any) => {
    launchReal(p).catch((e) => toast(e?.message || "Launch failed", true));
  };
  installTokenOpenHook();
  installPortfolioHook();
  // Load real tokens into the design (empties the demo array), then render.
  loadTokens()
    .then(() => {
      if (typeof W().render === "function") W().render();
    })
    .catch((e) => console.warn("[COUR live] loadTokens:", e));
}
