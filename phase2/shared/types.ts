// Shared types mirroring the Phase-1 indexer REST shapes (indexer/src/api).
// Phase-2 services consume these; no contract code here.

export type Hex = `0x${string}`;

export interface TokenRow {
  address: Hex;
  curve: Hex;
  name: string | null;
  symbol: string | null;
  creator: Hex;
  stock: Hex;
  stockDecimals: number;
  feeBps: number;
  mode: number; // 0 CREATOR | 1 HOLDERS | 2 BUYBACK | 3 BUYBACK_BURN
  launchedAt: number;
  launchBlock: number;
  graduated: boolean;
  graduatedAt: number | null;
  poolId: Hex | null;
  positionId: string | null;
  vS: string;
  vT: string;
  progressBps: number;
  lastPriceStock: number;
  lastPriceUsd: number | null;
  volumeStock: number;
  volumeUsd: number;
  tradeCount: number;
  lastTradeAt: number | null;
  holderCount?: number;
  stockSymbol?: string;
}

export interface TradeRow {
  id: string;
  token: Hex;
  source: "curve" | "pool";
  side: "buy" | "sell";
  trader: Hex;
  stockAmount: string;
  tokenAmount: string;
  fee: string;
  tax: string;
  priceStock: number;
  priceUsd: number | null;
  txHash: Hex;
  logIndex: number;
  ts: number;
  block: number;
}

export interface CandleRow {
  token: Hex;
  interval: string;
  bucketTs: number;
  openUsd: number | null;
  highUsd: number | null;
  lowUsd: number | null;
  closeUsd: number | null;
  volumeUsd: number;
  ts: number;
}

export interface GlobalStats {
  totalTokens: number;
  totalGraduated: number;
  totalTrades: number;
  totalVolumeUsd: number;
  uniqueHolders: number;
}
