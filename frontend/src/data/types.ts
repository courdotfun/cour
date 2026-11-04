// Types mirroring the indexer Ponder schema + REST responses (indexer/src/api).

export type Hex = `0x${string}`;

export interface TokenRow {
  address: Hex;
  curve: Hex;
  name: string | null;
  symbol: string | null;
  metadataURI: string | null;
  creator: Hex;
  stock: Hex;
  stockDecimals: number;
  feeBps: number;
  mode: number; // 0 CREATOR | 1 HOLDERS | 2 BUYBACK | 3 BUYBACK_BURN
  feeRecipient: Hex | null;
  startPriceX: string;
  launchedAt: number;
  launchBlock: number;
  graduated: boolean;
  graduatedAt: number | null;
  poolId: Hex | null;
  positionId: string | null;
  vS: string;
  vT: string;
  vT0: string;
  vTStop: string;
  progressBps: number;
  lastPriceStock: number;
  lastPriceUsd: number | null;
  volumeStock: number;
  volumeUsd: number;
  tradeCount: number;
  lastTradeAt: number | null;
  holderCount?: number;
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
  id: string;
  token: Hex;
  interval: string;
  bucketTs: number;
  openStock: number;
  highStock: number;
  lowStock: number;
  closeStock: number;
  openUsd: number | null;
  highUsd: number | null;
  lowUsd: number | null;
  closeUsd: number | null;
  volumeStock: number;
  volumeUsd: number;
  ts: number;
}

export interface HolderRow {
  id: string;
  token: Hex;
  address: Hex;
  balance: string;
  isExcluded: boolean;
}

export interface UserStats {
  address: Hex;
  volumeUsd: number;
  tradeCount: number;
  launchCount: number;
}

export interface PortfolioPosition {
  token: Hex;
  balance: string;
  balanceWhole: number;
  name: string | null;
  symbol: string | null;
  lastPriceStock: number | null;
  lastPriceUsd: number | null;
  graduated: boolean;
  valueUsd: number | null;
}

export interface Portfolio {
  address: Hex;
  stats: UserStats;
  totalValueUsd: number;
  positions: PortfolioPosition[];
}

export interface GlobalStats {
  totalTokens: number;
  totalGraduated: number;
  totalTrades: number;
  totalVolumeUsd: number;
  uniqueHolders: number;
}

export type TokenFilter = "new" | "trending" | "graduating" | "graduated";

export const FEE_MODE_LABELS = ["CREATOR", "HOLDERS", "BUYBACK", "BUYBACK_BURN"] as const;
export function feeModeLabel(mode: number): string {
  return FEE_MODE_LABELS[mode] ?? `MODE_${mode}`;
}
