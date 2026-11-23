// Visual-parity ONLY: a deterministic stock-page detail so /stock/[symbol] renders the
// same NVDA page v8's openStock('NVDA') shows. NEVER used in production (gated by FIXTURE
// in lib/server/stock.ts). Dynamic/divergent regions (chart, price, change, market-hours,
// order panel, trades) are masked in the harness; this supplies a stable layout + chrome.
import type { TokenDetail } from "./server/token";
import type { UiToken } from "./live/map";

const NVDA_STOCK = "0x0000000000000000000000000000000000000001" as const;
const CURVE = "0x00000000000000000000000000000000000000c0" as const;

// Neutral copy only — see docs/LEGAL_TODO.md. We do NOT assert an instrument type
// ("debt security") or a hard "1:1 share" backing claim in visible, compared text.
export const STOCK_FIXTURE: Record<string, { name: string }> = {
  NVDA: { name: "NVIDIA" },
};

export function fixtureStockDetail(symbol: string): TokenDetail | null {
  const sym = symbol.toUpperCase();
  const meta = STOCK_FIXTURE[sym];
  if (!meta) return null;
  const ui: UiToken = {
    name: meta.name,
    tick: sym,
    mc: "0",
    fdv: "—",
    chg: 0,
    cat: "trending",
    badge: "Trending",
    age: "—",
    addr: "Tokenized stock",
    h: [0, 0, 0, 0, 0, 0, 0, 0],
    hue: 120,
    logo: null,
    creatorFee: 0,
    pair: sym,
    _mc: 0,
    _p0: 0,
    address: NVDA_STOCK,
    curve: CURVE,
    pairedStock: NVDA_STOCK,
    stockDecimals: 18,
    mode: 0,
    graduated: false,
    progressBps: 0,
    lastPriceUsd: 0,
    priceStock: 1,
  };
  return {
    ui,
    raw: {
      address: NVDA_STOCK, curve: CURVE, name: meta.name, symbol: sym, metadataURI: null,
      creator: "0x0000000000000000000000000000000000000000", stock: NVDA_STOCK, stockDecimals: 18, feeBps: 0, mode: 0, feeRecipient: null,
      startPriceX: "0", launchedAt: 1_700_000_000, launchBlock: 1, graduated: false, graduatedAt: null,
      poolId: null, positionId: null, vS: "0", vT: "0", vT0: "0", vTStop: "0", progressBps: 0,
      lastPriceStock: 1, lastPriceUsd: 0, volumeStock: 0, volumeUsd: 0, tradeCount: 0,
      lastTradeAt: null, holderCount: 0,
    },
    holderCount: 0,
    liquidityUsd: 0,
    candles: Array.from({ length: 24 }, (_, i) => {
      const base = 150 + i * 0.5;
      return { o: base, h: base + 1, l: base - 1, c: base + 0.2, v: 1000 + i * 10 };
    }),
    trades: [],
    holders: [],
    description: null,
    links: null,
  };
}
