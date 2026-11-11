// Map real indexer / on-chain data into the shape the approved design's inline
// render functions expect (card(), openToken(), the price feed). This lets us
// drive the ORIGINAL design with 100% real data instead of the demo `tokens`
// array — no fabricated numbers, honest empty states.
import type { TokenRow, CandleRow } from "../data/types";
import { shortAddr } from "../ui/format";

const SUPPLY = 1e9;

// Design token-object shape consumed by card() / openToken() / the price engine.
export interface UiToken {
  name: string;
  tick: string;
  mc: string; // "60.0K" / "1.2M" — design formats with a leading "$"
  fdv: string; // "—" or like mc
  chg: number; // 24h %, from candles when available else 0
  cat: "new" | "trending" | "graduated";
  badge: "New" | "Trending" | "Graduated";
  age: string; // "3d" / "2h" / "now"
  addr: string; // short form for display
  h: number[]; // 8-point sparkline (real closes, else flat)
  hue: number; // derived deterministically from the address
  logo?: string | null;
  creatorFee: number; // percent (1..10)
  pair: string; // paired stock symbol
  _mc: number;
  _p0: number;
  mine?: boolean;
  // ---- real fields used by the live trade/launch handlers (not by the design) ----
  address: `0x${string}`;
  curve: `0x${string}`;
  stock: `0x${string}`;
  stockDecimals: number;
  mode: number;
  graduated: boolean;
  progressBps: number;
  lastPriceUsd: number | null;
  priceStock: number;
}

function fmtMc(v: number): string {
  if (!isFinite(v) || v <= 0) return "0";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return Math.round(v / 1e3) + "K";
  return v.toFixed(0);
}

function hueOf(addr: string): number {
  let h = 0;
  for (let i = 2; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) % 360;
  return h;
}

export function ageOf(launchedAt: number | null | undefined): string {
  if (!launchedAt) return "now";
  const secs = Math.floor(Date.now() / 1000) - launchedAt;
  if (secs < 60) return "now";
  if (secs < 3600) return Math.floor(secs / 60) + "m";
  if (secs < 86400) return Math.floor(secs / 3600) + "h";
  return Math.floor(secs / 86400) + "d";
}

// 24h change and an 8-point sparkline, derived from real candles when present.
function changeAndSpark(candles: CandleRow[] | null, lastUsd: number | null): { chg: number; h: number[] } {
  if (candles && candles.length > 1) {
    const closes = candles.map((c) => c.closeUsd ?? c.closeStock).filter((x) => isFinite(x) && x > 0);
    if (closes.length > 1) {
      const first = closes[0];
      const last = closes[closes.length - 1];
      const chg = first > 0 ? Math.round(((last - first) / first) * 1000) / 10 : 0;
      // down-sample to 8 points for the card sparkline
      const n = 8;
      const h: number[] = [];
      for (let i = 0; i < n; i++) {
        const idx = Math.floor((i / (n - 1)) * (closes.length - 1));
        h.push(closes[idx]);
      }
      return { chg, h };
    }
  }
  const base = lastUsd && lastUsd > 0 ? lastUsd : 1;
  return { chg: 0, h: new Array(8).fill(base) };
}

function pairSymbol(t: TokenRow): string {
  // Phase-1 beta only configures NVDA as the paired stock; surface the symbol
  // when the indexer carries it, else fall back to NVDA.
  return (t as any).stockSymbol || "NVDA";
}

export function mapToken(
  t: TokenRow,
  extras?: { candles?: CandleRow[] | null; wallet?: string | null; logo?: string | null },
): UiToken {
  const priceUsd = t.lastPriceUsd;
  const mcNum = priceUsd != null && priceUsd > 0 ? priceUsd * SUPPLY : 0;
  const { chg, h } = changeAndSpark(extras?.candles ?? null, priceUsd ?? null);
  const cat: UiToken["cat"] = t.graduated
    ? "graduated"
    : t.progressBps >= 6000
      ? "trending"
      : "new";
  const badge: UiToken["badge"] =
    cat === "graduated" ? "Graduated" : cat === "trending" ? "Trending" : "New";
  const mine = !!(extras?.wallet && t.creator && t.creator.toLowerCase() === extras.wallet.toLowerCase());
  return {
    name: t.name || t.symbol || shortAddr(t.address),
    tick: (t.symbol || "TOKEN").toUpperCase(),
    mc: fmtMc(mcNum),
    fdv: mcNum > 0 ? fmtMc(mcNum) : "—",
    chg,
    cat,
    badge,
    age: ageOf(t.launchedAt),
    addr: shortAddr(t.address),
    h,
    hue: hueOf(t.address),
    logo: extras?.logo ?? null,
    creatorFee: Math.max(1, Math.round(t.feeBps / 100)),
    pair: pairSymbol(t),
    _mc: mcNum,
    _p0: mcNum,
    mine,
    address: t.address,
    curve: t.curve,
    stock: t.stock,
    stockDecimals: t.stockDecimals,
    mode: t.mode,
    graduated: t.graduated,
    progressBps: t.progressBps,
    lastPriceUsd: priceUsd,
    priceStock: t.lastPriceStock,
  };
}

// Real OHLC candles for the token-page chart, in the design's {o,h,l,c,v} shape.
export function mapCandles(rows: CandleRow[]): { o: number; h: number; l: number; c: number; v: number }[] {
  return rows
    .map((r) => ({
      o: r.openUsd ?? r.openStock,
      h: r.highUsd ?? r.highStock,
      l: r.lowUsd ?? r.lowStock,
      c: r.closeUsd ?? r.closeStock,
      v: r.volumeUsd || r.volumeStock || 0,
    }))
    .filter((k) => isFinite(k.c) && k.c > 0);
}
