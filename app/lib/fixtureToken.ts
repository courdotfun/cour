// Visual-parity ONLY: a deterministic TokenDetail for the token-detail view, so the
// app's /token/[address] renders the same AUR (Aurora) token v8's openToken('AUR')
// shows. NEVER used in production (gated by FIXTURE in lib/server/token.ts).
// Dynamic/divergent regions (chart, trades, holders, random stats, updates, time) are
// masked in the parity harness; this supplies enough for a stable layout + static chrome.
import type { TokenDetail } from "./server/token";
import type { UiToken } from "./live/map";
import { FIXTURE_TOKENS } from "./fixture";

const AUR = FIXTURE_TOKENS.find((t) => t.tick === "AUR") as UiToken;
const ADDR = "0x0000000000000000000000000000000000000005" as const;
const CREATOR = "0x0000000000000000000000000000000000001337" as const;
const NVDA = "0x0000000000000000000000000000000000000001" as const;

export const FIXTURE_TOKEN_ADDR = ADDR;

export const FIXTURE_TOKEN_DETAIL: TokenDetail = {
  // Price matches v8's openToken formula: parseFloat(t.mc)*1e6/1e9 (19.7M → 0.0197).
  ui: { ...AUR, lastPriceUsd: 0.0197 },
  raw: {
    address: ADDR,
    curve: ADDR,
    name: AUR.name,
    symbol: AUR.tick,
    metadataURI: null,
    creator: CREATOR,
    stock: NVDA,
    stockDecimals: 18,
    feeBps: 100,
    mode: 0,
    feeRecipient: null,
    startPriceX: "0",
    launchedAt: 1_700_000_000,
    launchBlock: 1,
    graduated: false,
    graduatedAt: null,
    poolId: null,
    positionId: null,
    vS: "0",
    vT: "0",
    vT0: "0",
    vTStop: "0",
    progressBps: AUR.progressBps,
    lastPriceStock: 1,
    lastPriceUsd: 0.0197,
    volumeStock: 0,
    // v8 openToken('AUR') under Math.random=0.5 → 24h Volume $9.85M, Liquidity $2.46M,
    // Holders 4,600 (mcNum=19.7e6; vol=mcNum*0.5/1e6, liq=mcNum*0.125/1e6, holders=600+4000).
    volumeUsd: 9_850_000,
    tradeCount: 0,
    lastTradeAt: null,
    holderCount: 4600,
  },
  holderCount: 4600,
  liquidityUsd: 2_462_500,
  // A few fixed candles so the chart card lays out (masked in the diff).
  candles: Array.from({ length: 24 }, (_, i) => {
    const base = 0.015 + i * 0.0002;
    return { o: base, h: base + 0.0004, l: base - 0.0003, c: base + 0.0001, v: 1000 + i * 10 };
  }),
  trades: [],
  holders: [],
  description: "Aurora is a community token on Robinhood Chain, paired with NVDA.",
  links: null,
};
