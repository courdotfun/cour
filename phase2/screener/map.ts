// Pure mappers that expose COUR data in the schemas DEX screeners ingest.
// COUR uses Uniswap v4 (singleton PoolManager) + a bonding curve pre-graduation,
// neither of which screeners auto-index like v2/v3 — so we present:
//   * pre-graduation: the bonding curve as a SYNTHETIC pair (pairId = curve addr)
//   * post-graduation: the real v4 pool (pairId = poolId), LP burned
import type { TokenRow, TradeRow, CandleRow } from "../shared/types.ts";

export const CHAIN_ID = 4663;
export const DEX_ID = "cour";

// ---- DexScreener adapter spec (pair / asset / events) ---------------------
export interface DexToken {
  address: string;
  name: string;
  symbol: string;
}
export interface DexPair {
  chainId: number;
  dexId: string;
  pairId: string;
  baseToken: DexToken;
  quoteToken: DexToken;
  priceUsd: number | null;
  priceNative: number; // price in quote (stock) units
  liquidityUsd: number;
  volumeH24Usd: number;
  txCount24h: number | null;
  graduated: boolean;
  lpBurned: boolean; // COUR: true once graduated (owner DEAD, no removal)
  createdAtTs: number;
}

export function toDexScreenerPair(t: TokenRow): DexPair {
  const pairId = (t.graduated && t.poolId ? t.poolId : t.curve).toLowerCase();
  const quoteSymbol = t.stockSymbol || "STOCK";
  // Synthetic reserve proxy for the curve: virtual stock reserve in USD.
  const liquidityUsd = t.lastPriceUsd != null ? Math.max(0, Number(t.vS) / 10 ** t.stockDecimals) * (t.lastPriceUsd / (t.lastPriceStock || 1)) : 0;
  return {
    chainId: CHAIN_ID,
    dexId: DEX_ID,
    pairId,
    baseToken: { address: t.address, name: t.name || t.symbol || "COUR Token", symbol: (t.symbol || "TOKEN").toUpperCase() },
    quoteToken: { address: t.stock, name: quoteSymbol, symbol: quoteSymbol },
    priceUsd: t.lastPriceUsd,
    priceNative: t.lastPriceStock,
    liquidityUsd: Number.isFinite(liquidityUsd) ? liquidityUsd : 0,
    volumeH24Usd: t.volumeUsd,
    txCount24h: t.tradeCount || null,
    graduated: t.graduated,
    lpBurned: t.graduated,
    createdAtTs: t.launchedAt,
  };
}

export interface DexEvent {
  pairId: string;
  blockNumber: number;
  txnId: string;
  eventType: "swap";
  maker: string;
  side: "buy" | "sell";
  amountBaseToken: string;
  amountQuoteToken: string;
  priceUsd: number | null;
  ts: number;
}

export function toDexScreenerEvents(trades: TradeRow[], pairIdOf: (token: string) => string): DexEvent[] {
  return trades.map((tr) => ({
    pairId: pairIdOf(tr.token),
    blockNumber: tr.block,
    txnId: `${tr.txHash}:${tr.logIndex}`,
    eventType: "swap",
    maker: tr.trader,
    side: tr.side,
    amountBaseToken: tr.tokenAmount,
    amountQuoteToken: tr.stockAmount,
    priceUsd: tr.priceUsd,
    ts: tr.ts,
  }));
}

// ---- GeckoTerminal / CoinGecko on-chain pool + OHLCV ----------------------
export interface GeckoPool {
  id: string;
  type: "pool";
  attributes: {
    address: string;
    name: string;
    base_token_price_usd: string | null;
    quote_token_price_usd: string | null;
    reserve_in_usd: string;
    volume_usd_h24: string;
    pool_created_at: string; // ISO-ish (seconds as string here)
  };
}

export function toGeckoPool(t: TokenRow): GeckoPool {
  const pairId = (t.graduated && t.poolId ? t.poolId : t.curve).toLowerCase();
  const pair = toDexScreenerPair(t);
  return {
    id: `cour_${pairId}`,
    type: "pool",
    attributes: {
      address: pairId,
      name: `${(t.symbol || "TOKEN").toUpperCase()} / ${t.stockSymbol || "STOCK"}`,
      base_token_price_usd: t.lastPriceUsd != null ? String(t.lastPriceUsd) : null,
      quote_token_price_usd: null,
      reserve_in_usd: String(pair.liquidityUsd),
      volume_usd_h24: String(t.volumeUsd),
      pool_created_at: String(t.launchedAt),
    },
  };
}

// OHLCV in GeckoTerminal order: [timestamp, open, high, low, close, volume].
export function toGeckoOhlcv(candles: CandleRow[]): number[][] {
  return candles
    .filter((c) => c.closeUsd != null)
    .map((c) => [c.bucketTs, c.openUsd ?? 0, c.highUsd ?? 0, c.lowUsd ?? 0, c.closeUsd ?? 0, c.volumeUsd]);
}
