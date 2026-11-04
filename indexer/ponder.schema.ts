import { onchainTable, index } from "ponder";

/**
 * token — one row per launched COUR token (the canonical object the UI lists).
 * Prices are stored both as the on-chain 1e18-scaled value (…X) and as a float
 * (lastPriceStock / lastPriceUsd) for easy charting.
 */
export const token = onchainTable(
  "token",
  (t) => ({
    address: t.hex().primaryKey(),
    curve: t.hex().notNull(),
    name: t.text(),
    symbol: t.text(),
    metadataURI: t.text(),
    creator: t.hex().notNull(),
    stock: t.hex().notNull(),
    stockDecimals: t.integer().notNull().default(18),
    feeBps: t.integer().notNull().default(0),
    mode: t.integer().notNull().default(0),
    feeRecipient: t.hex(),
    startPriceX: t.bigint().notNull().default(0n),
    launchedAt: t.integer().notNull().default(0),
    launchBlock: t.integer().notNull().default(0),
    graduated: t.boolean().notNull().default(false),
    graduatedAt: t.integer(),
    poolId: t.hex(),
    positionId: t.bigint(),
    // live virtual reserves + bonding-curve progress
    vS: t.bigint().notNull().default(0n),
    vT: t.bigint().notNull().default(0n),
    vT0: t.bigint().notNull().default(0n),
    vTStop: t.bigint().notNull().default(0n),
    progressBps: t.integer().notNull().default(0),
    lastPriceStock: t.doublePrecision().notNull().default(0),
    lastPriceUsd: t.doublePrecision(),
    // rolling aggregates for trending / sorting
    volumeStock: t.doublePrecision().notNull().default(0),
    volumeUsd: t.doublePrecision().notNull().default(0),
    tradeCount: t.integer().notNull().default(0),
    lastTradeAt: t.integer(),
  }),
  (t) => ({
    creatorIdx: index().on(t.creator),
    graduatedIdx: index().on(t.graduated),
    lastTradeIdx: index().on(t.lastTradeAt),
    launchedIdx: index().on(t.launchedAt),
  }),
);

/** pool — reverse lookup from a graduated pool id to its token (for PoolManager events). */
export const pool = onchainTable("pool", (t) => ({
  id: t.hex().primaryKey(), // poolId (bytes32)
  token: t.hex().notNull(),
  stock: t.hex().notNull(),
  tokenIsCurrency0: t.boolean().notNull(),
}));

/** trade — curve trades (source=curve) and post-graduation pool swaps (source=pool). */
export const trade = onchainTable(
  "trade",
  (t) => ({
    id: t.text().primaryKey(), // `${txHash}-${logIndex}`
    token: t.hex().notNull(),
    source: t.text().notNull(), // "curve" | "pool"
    side: t.text().notNull(), // "buy" | "sell"
    trader: t.hex().notNull(),
    stockAmount: t.bigint().notNull(),
    tokenAmount: t.bigint().notNull(),
    fee: t.bigint().notNull().default(0n),
    tax: t.bigint().notNull().default(0n),
    priceStock: t.doublePrecision().notNull().default(0),
    priceUsd: t.doublePrecision(),
    vS: t.bigint(),
    vT: t.bigint(),
    txHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
    ts: t.integer().notNull(),
    block: t.integer().notNull(),
  }),
  (t) => ({
    tokenTsIdx: index().on(t.token, t.ts),
    traderIdx: index().on(t.trader),
  }),
);

/** candle — OHLCV per token per interval, in BOTH stock and usd terms. */
export const candle = onchainTable(
  "candle",
  (t) => ({
    id: t.text().primaryKey(), // `${token}-${interval}-${bucketTs}`
    token: t.hex().notNull(),
    interval: t.text().notNull(), // "1m" | "5m" | "1h" | "1d"
    bucketTs: t.integer().notNull(),
    openStock: t.doublePrecision().notNull(),
    highStock: t.doublePrecision().notNull(),
    lowStock: t.doublePrecision().notNull(),
    closeStock: t.doublePrecision().notNull(),
    openUsd: t.doublePrecision(),
    highUsd: t.doublePrecision(),
    lowUsd: t.doublePrecision(),
    closeUsd: t.doublePrecision(),
    volumeStock: t.doublePrecision().notNull().default(0),
    volumeUsd: t.doublePrecision().notNull().default(0),
    ts: t.integer().notNull(),
  }),
  (t) => ({
    tokenIntervalIdx: index().on(t.token, t.interval, t.bucketTs),
  }),
);

/** holder — per-token ERC-20 balance derived from Transfer. isExcluded flags protocol plumbing. */
export const holder = onchainTable(
  "holder",
  (t) => ({
    id: t.text().primaryKey(), // `${token}-${address}`
    token: t.hex().notNull(),
    address: t.hex().notNull(),
    balance: t.bigint().notNull().default(0n),
    isExcluded: t.boolean().notNull().default(false),
  }),
  (t) => ({
    tokenIdx: index().on(t.token),
    addressIdx: index().on(t.address),
  }),
);

/** feeEvent — FeeTaken from either the FeeVault (curve fees) or the Hook (pool fees). */
export const feeEvent = onchainTable(
  "fee_event",
  (t) => ({
    id: t.text().primaryKey(),
    token: t.hex().notNull(),
    payer: t.hex().notNull(),
    stockFee: t.bigint().notNull(),
    toCreatorSide: t.bigint().notNull(),
    toPlatform: t.bigint().notNull(),
    source: t.text().notNull(), // "vault" | "hook"
    txHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
    ts: t.integer().notNull(),
  }),
  (t) => ({ tokenIdx: index().on(t.token) }),
);

/** claim — creator (FeeClaimed) | holder (HolderClaimed) | platform (PlatformClaimed). */
export const claim = onchainTable(
  "claim",
  (t) => ({
    id: t.text().primaryKey(),
    kind: t.text().notNull(), // "creator" | "holder" | "platform"
    token: t.hex(), // null for platform claims
    stock: t.hex(), // set for platform claims
    recipient: t.hex().notNull(),
    amount: t.bigint().notNull(),
    txHash: t.hex().notNull(),
    logIndex: t.integer().notNull(),
    ts: t.integer().notNull(),
  }),
  (t) => ({
    tokenIdx: index().on(t.token),
    recipientIdx: index().on(t.recipient),
  }),
);

/** buyback — BuybackExecuted (platform buys back + optionally burns tokens). */
export const buyback = onchainTable("buyback", (t) => ({
  id: t.text().primaryKey(),
  token: t.hex().notNull(),
  stockIn: t.bigint().notNull(),
  tokensOut: t.bigint().notNull(),
  burned: t.boolean().notNull(),
  txHash: t.hex().notNull(),
  ts: t.integer().notNull(),
}));

/** stockPrice — snapshot of PriceReader.stockUsd(stock) bucketed per minute. */
export const stockPrice = onchainTable("stock_price", (t) => ({
  id: t.text().primaryKey(), // `${stock}-${bucketTs}`
  stock: t.hex().notNull(),
  priceUsdX18: t.bigint().notNull(),
  ts: t.integer().notNull(),
}));

/** stock — allowed quote assets configured via StockSet. */
export const stock = onchainTable("stock", (t) => ({
  address: t.hex().primaryKey(),
  allowed: t.boolean().notNull().default(false),
  refPool: t.hex(),
  refKind: t.integer(),
}));

/** userStats — per-trader lifetime aggregates (for /top-users, /portfolio). */
export const userStats = onchainTable("user_stats", (t) => ({
  address: t.hex().primaryKey(),
  volumeUsd: t.doublePrecision().notNull().default(0),
  tradeCount: t.integer().notNull().default(0),
  launchCount: t.integer().notNull().default(0),
}));

/** position — a user's holding of a token (for /portfolio). Mirrors non-excluded holder rows. */
export const globalStat = onchainTable("global_stat", (t) => ({
  id: t.text().primaryKey(), // always "global"
  totalTokens: t.integer().notNull().default(0),
  totalGraduated: t.integer().notNull().default(0),
  totalTrades: t.integer().notNull().default(0),
  totalVolumeUsd: t.doublePrecision().notNull().default(0),
}));

/** poolLiquidityEvent — ModifyLiquidity on a known COUR pool. */
export const poolLiquidityEvent = onchainTable("pool_liquidity_event", (t) => ({
  id: t.text().primaryKey(),
  poolId: t.hex().notNull(),
  token: t.hex().notNull(),
  sender: t.hex().notNull(),
  tickLower: t.integer().notNull(),
  tickUpper: t.integer().notNull(),
  liquidityDelta: t.bigint().notNull(),
  txHash: t.hex().notNull(),
  ts: t.integer().notNull(),
}));

/** adminEvent — log of protocol admin/config events (StockSet, LaunchParamsSet, …). */
export const adminEvent = onchainTable("admin_event", (t) => ({
  id: t.text().primaryKey(),
  type: t.text().notNull(),
  data: t.json(),
  txHash: t.hex().notNull(),
  ts: t.integer().notNull(),
  block: t.integer().notNull(),
}));
