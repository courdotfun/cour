import { ponder } from "ponder:registry";
import {
  token,
  pool,
  trade,
  holder,
  feeEvent,
  claim,
  buyback,
  stock,
  userStats,
  globalStat,
  poolLiquidityEvent,
  adminEvent,
} from "ponder:schema";
import type { Hex } from "viem";

import { COURCurveAbi } from "../abis/COURCurve";
import { COURTokenAbi } from "../abis/COURToken";
import {
  getStockUsdX18,
  stockUsdFloat,
  priceStockWhole,
  priceX18FromReserves,
  toWhole,
  updateCandles,
} from "./lib";
import { isExcludedHolder, ZERO } from "./addresses";

const GLOBAL = "global";
const BPS = 10000n;

/** Ensure the singleton global_stat row exists, then apply a delta. */
async function bumpGlobal(
  context: any,
  delta: Partial<{
    totalTokens: number;
    totalGraduated: number;
    totalTrades: number;
    totalVolumeUsd: number;
  }>,
) {
  await context.db
    .insert(globalStat)
    .values({
      id: GLOBAL,
      totalTokens: delta.totalTokens ?? 0,
      totalGraduated: delta.totalGraduated ?? 0,
      totalTrades: delta.totalTrades ?? 0,
      totalVolumeUsd: delta.totalVolumeUsd ?? 0,
    })
    .onConflictDoUpdate((row: any) => ({
      totalTokens: row.totalTokens + (delta.totalTokens ?? 0),
      totalGraduated: row.totalGraduated + (delta.totalGraduated ?? 0),
      totalTrades: row.totalTrades + (delta.totalTrades ?? 0),
      totalVolumeUsd: row.totalVolumeUsd + (delta.totalVolumeUsd ?? 0),
    }));
}

// ---------------------------------------------------------------- TokenLaunched
ponder.on("COURFactory:TokenLaunched", async ({ event, context }) => {
  const a = event.args;
  const tokenAddr = a.token as Hex;
  const curveAddr = a.curve as Hex;
  const ts = Number(event.block.timestamp);

  // Pull launch config from the freshly-deployed curve + token metadata.
  let stockDecimals = 18;
  let vS0 = 0n;
  let vT0 = 0n;
  let vTStop = 0n;
  try {
    const cfg: any = await context.client.readContract({
      abi: COURCurveAbi,
      address: curveAddr,
      functionName: "config",
    });
    stockDecimals = Number(cfg.stockDecimals);
    vS0 = cfg.vS0;
    vT0 = cfg.vT0;
    vTStop = cfg.vTStop;
  } catch {
    /* keep defaults */
  }

  let name: string | undefined;
  let symbol: string | undefined;
  try {
    [name, symbol] = (await Promise.all([
      context.client.readContract({
        abi: COURTokenAbi,
        address: tokenAddr,
        functionName: "name",
      }),
      context.client.readContract({
        abi: COURTokenAbi,
        address: tokenAddr,
        functionName: "symbol",
      }),
    ])) as [string, string];
  } catch {
    /* leave undefined */
  }

  const startPriceX = a.startPriceX as bigint;
  const priceStock = priceStockWhole(startPriceX, stockDecimals);
  const stockUsdX18 = await getStockUsdX18(
    context,
    a.stock as Hex,
    event.block.number,
    ts,
  );
  const sUsd = stockUsdFloat(stockUsdX18);
  const priceUsd = sUsd === null ? null : priceStock * sUsd;

  await context.db.insert(token).values({
    address: tokenAddr,
    curve: curveAddr,
    name,
    symbol,
    metadataURI: a.metadataURI,
    creator: a.creator as Hex,
    stock: a.stock as Hex,
    stockDecimals,
    feeBps: Number(a.creatorFeeBps),
    mode: Number(a.creatorMode),
    feeRecipient: a.feeRecipient as Hex,
    startPriceX,
    launchedAt: ts,
    launchBlock: Number(event.block.number),
    graduated: false,
    vS: vS0,
    vT: vT0,
    vT0,
    vTStop,
    progressBps: 0,
    lastPriceStock: priceStock,
    lastPriceUsd: priceUsd,
  });

  // The initial mint goes to the curve; make sure its holder row is excluded.
  await context.db
    .insert(holder)
    .values({
      id: `${tokenAddr.toLowerCase()}-${curveAddr.toLowerCase()}`,
      token: tokenAddr,
      address: curveAddr,
      balance: 0n,
      isExcluded: true,
    })
    .onConflictDoUpdate(() => ({ isExcluded: true }));

  await context.db
    .insert(userStats)
    .values({
      address: a.creator as Hex,
      volumeUsd: 0,
      tradeCount: 0,
      launchCount: 1,
    })
    .onConflictDoUpdate((row: any) => ({ launchCount: row.launchCount + 1 }));

  await bumpGlobal(context, { totalTokens: 1 });
});

// ------------------------------------------------------------------- CurveTrade
ponder.on("COURCurve:CurveTrade", async ({ event, context }) => {
  const a = event.args;
  const tokenAddr = a.token as Hex;
  const ts = Number(event.block.timestamp);

  const row: any = await context.db.find(token, { address: tokenAddr });
  const stockDecimals = row ? row.stockDecimals : 18;
  const stockAddr = (row ? row.stock : ZERO) as Hex;
  const vT0: bigint = row ? row.vT0 : 0n;
  const vTStop: bigint = row ? row.vTStop : 0n;

  const vS = a.vS as bigint;
  const vT = a.vT as bigint;
  const priceX18 = priceX18FromReserves(vS, vT);
  const priceStock = priceStockWhole(priceX18, stockDecimals);

  const stockUsdX18 = await getStockUsdX18(
    context,
    stockAddr,
    event.block.number,
    ts,
  );
  const sUsd = stockUsdFloat(stockUsdX18);
  const priceUsd = sUsd === null ? null : priceStock * sUsd;

  const volStock = toWhole(a.stockAmount as bigint, stockDecimals);
  const volUsd = sUsd === null ? 0 : volStock * sUsd;

  // bonding-curve progress (mirrors COURCurve.progressBps()).
  let progressBps = 0;
  const soldAtStop = vT0 - vTStop;
  if (soldAtStop > 0n) {
    const sold = vT0 - vT;
    let bps = (sold * BPS) / soldAtStop;
    if (bps > BPS) bps = BPS;
    if (bps < 0n) bps = 0n;
    progressBps = Number(bps);
  }

  const side = a.isBuy ? "buy" : "sell";
  await context.db.insert(trade).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: tokenAddr,
    source: "curve",
    side,
    trader: a.trader as Hex,
    stockAmount: a.stockAmount as bigint,
    tokenAmount: a.tokenAmount as bigint,
    fee: a.fee as bigint,
    tax: a.tax as bigint,
    priceStock,
    priceUsd,
    vS,
    vT,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    ts,
    block: Number(event.block.number),
  });

  if (row) {
    await context.db.update(token, { address: tokenAddr }).set((r: any) => ({
      vS,
      vT,
      progressBps,
      lastPriceStock: priceStock,
      lastPriceUsd: priceUsd ?? r.lastPriceUsd,
      volumeStock: r.volumeStock + volStock,
      volumeUsd: r.volumeUsd + volUsd,
      tradeCount: r.tradeCount + 1,
      lastTradeAt: ts,
    }));
  }

  await updateCandles(context, tokenAddr, ts, priceStock, priceUsd, volStock, volUsd);

  await context.db
    .insert(userStats)
    .values({
      address: a.trader as Hex,
      volumeUsd: volUsd,
      tradeCount: 1,
      launchCount: 0,
    })
    .onConflictDoUpdate((r: any) => ({
      volumeUsd: r.volumeUsd + volUsd,
      tradeCount: r.tradeCount + 1,
    }));

  await bumpGlobal(context, { totalTrades: 1, totalVolumeUsd: volUsd });
});

// --------------------------------------------------------------------- Graduated
ponder.on("COURFactory:Graduated", async ({ event, context }) => {
  const a = event.args;
  const tokenAddr = a.token as Hex;
  const poolId = a.poolId as Hex;
  const ts = Number(event.block.timestamp);

  const row: any = await context.db.find(token, { address: tokenAddr });
  const stockAddr = (row ? row.stock : ZERO) as Hex;
  // v4 sorts pool currencies by address; token is currency0 if token < stock.
  const tokenIsCurrency0 =
    BigInt(tokenAddr) < BigInt(stockAddr);

  await context.db.update(token, { address: tokenAddr }).set({
    graduated: true,
    graduatedAt: ts,
    poolId,
    positionId: a.positionId as bigint,
  });

  await context.db
    .insert(pool)
    .values({
      id: poolId,
      token: tokenAddr,
      stock: stockAddr,
      tokenIsCurrency0,
    })
    .onConflictDoNothing();

  await bumpGlobal(context, { totalGraduated: 1 });
});

// ----------------------------------------------------------------- FeeTaken (x2)
async function recordFee(event: any, context: any, source: "vault" | "hook") {
  const a = event.args;
  await context.db.insert(feeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: a.token as Hex,
    payer: a.payer as Hex,
    stockFee: a.stockFee as bigint,
    toCreatorSide: a.toCreatorSide as bigint,
    toPlatform: a.toPlatform as bigint,
    source,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    ts: Number(event.block.timestamp),
  });
}
ponder.on("COURFeeVault:FeeTaken", ({ event, context }) =>
  recordFee(event, context, "vault"),
);
ponder.on("COURHook:FeeTaken", ({ event, context }) =>
  recordFee(event, context, "hook"),
);

// ----------------------------------------------------------------------- claims
ponder.on("COURFeeVault:FeeClaimed", async ({ event, context }) => {
  const a = event.args;
  await context.db.insert(claim).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    kind: "creator",
    token: a.token as Hex,
    stock: null,
    recipient: a.recipient as Hex,
    amount: a.amount as bigint,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    ts: Number(event.block.timestamp),
  });
});

ponder.on("COURFeeVault:HolderClaimed", async ({ event, context }) => {
  const a = event.args;
  await context.db.insert(claim).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    kind: "holder",
    token: a.token as Hex,
    stock: null,
    recipient: a.holder as Hex,
    amount: a.amount as bigint,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    ts: Number(event.block.timestamp),
  });
});

ponder.on("COURFeeVault:PlatformClaimed", async ({ event, context }) => {
  const a = event.args;
  await context.db.insert(claim).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    kind: "platform",
    token: null,
    stock: a.stock as Hex,
    recipient: a.treasury as Hex,
    amount: a.amount as bigint,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    ts: Number(event.block.timestamp),
  });
});

// --------------------------------------------------------------------- buyback
ponder.on("COURFeeVault:BuybackExecuted", async ({ event, context }) => {
  const a = event.args;
  await context.db.insert(buyback).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: a.token as Hex,
    stockIn: a.stockIn as bigint,
    tokensOut: a.tokensOut as bigint,
    burned: a.burned as boolean,
    txHash: event.transaction.hash,
    ts: Number(event.block.timestamp),
  });
});

// ------------------------------------------------------------- FeeRecipientChanged
ponder.on("COURFeeVault:FeeRecipientChanged", async ({ event, context }) => {
  const a = event.args;
  const row = await context.db.find(token, { address: a.token as Hex });
  if (row) {
    await context.db
      .update(token, { address: a.token as Hex })
      .set({ feeRecipient: a.newRecipient as Hex });
  }
});

// ------------------------------------------------------------- ERC-20 Transfer
ponder.on("COURToken:Transfer", async ({ event, context }) => {
  const tokenAddr = event.log.address as Hex;
  const from = event.args.from as Hex;
  const to = event.args.to as Hex;
  const value = event.args.value as bigint;
  if (value === 0n) return;

  const tokRow: any = await context.db.find(token, { address: tokenAddr });
  const curve = tokRow ? (tokRow.curve as Hex) : null;

  const apply = async (addr: Hex, delta: bigint) => {
    if (addr.toLowerCase() === ZERO.toLowerCase()) return;
    const id = `${tokenAddr.toLowerCase()}-${addr.toLowerCase()}`;
    await context.db
      .insert(holder)
      .values({
        id,
        token: tokenAddr,
        address: addr,
        balance: delta < 0n ? 0n : delta,
        isExcluded: isExcludedHolder(addr, curve),
      })
      .onConflictDoUpdate((r: any) => ({
        balance: r.balance + delta,
        isExcluded: isExcludedHolder(addr, curve),
      }));
  };

  await apply(from, -value);
  await apply(to, value);
});

// ------------------------------------------------------- PoolManager (COUR pools)
ponder.on("PoolManager:Swap", async ({ event, context }) => {
  const id = event.args.id as Hex;
  const p: any = await context.db.find(pool, { id });
  if (!p) return; // not a COUR pool

  const ts = Number(event.block.timestamp);
  const tokRow: any = await context.db.find(token, { address: p.token as Hex });
  const stockDecimals = tokRow ? tokRow.stockDecimals : 18;

  const amount0 = event.args.amount0 as bigint;
  const amount1 = event.args.amount1 as bigint;
  // Pool-perspective deltas: positive = currency enters the pool.
  const tokenDelta = p.tokenIsCurrency0 ? amount0 : amount1;
  const stockDelta = p.tokenIsCurrency0 ? amount1 : amount0;

  const tokenAmt = tokenDelta < 0n ? -tokenDelta : tokenDelta;
  const stockAmt = stockDelta < 0n ? -stockDelta : stockDelta;
  // Token leaving the pool (tokenDelta < 0) => user is buying the token.
  const side = tokenDelta < 0n ? "buy" : "sell";

  const tokenWhole = Number(tokenAmt) / 1e18; // COURToken is 18 decimals
  const stockWhole = toWhole(stockAmt, stockDecimals);
  const priceStock = tokenWhole > 0 ? stockWhole / tokenWhole : 0;

  const stockUsdX18 = await getStockUsdX18(
    context,
    p.stock as Hex,
    event.block.number,
    ts,
  );
  const sUsd = stockUsdFloat(stockUsdX18);
  const priceUsd = sUsd === null ? null : priceStock * sUsd;
  const volUsd = sUsd === null ? 0 : stockWhole * sUsd;

  await context.db.insert(trade).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: p.token as Hex,
    source: "pool",
    side,
    trader: event.args.sender as Hex,
    stockAmount: stockAmt,
    tokenAmount: tokenAmt,
    fee: 0n,
    tax: 0n,
    priceStock,
    priceUsd,
    vS: null,
    vT: null,
    txHash: event.transaction.hash,
    logIndex: event.log.logIndex,
    ts,
    block: Number(event.block.number),
  });

  if (tokRow) {
    await context.db.update(token, { address: p.token as Hex }).set((r: any) => ({
      lastPriceStock: priceStock,
      lastPriceUsd: priceUsd ?? r.lastPriceUsd,
      volumeStock: r.volumeStock + stockWhole,
      volumeUsd: r.volumeUsd + volUsd,
      tradeCount: r.tradeCount + 1,
      lastTradeAt: ts,
    }));
  }

  await updateCandles(context, p.token as Hex, ts, priceStock, priceUsd, stockWhole, volUsd);
  await bumpGlobal(context, { totalTrades: 1, totalVolumeUsd: volUsd });
});

ponder.on("PoolManager:ModifyLiquidity", async ({ event, context }) => {
  const id = event.args.id as Hex;
  const p: any = await context.db.find(pool, { id });
  if (!p) return;
  await context.db.insert(poolLiquidityEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    poolId: id,
    token: p.token as Hex,
    sender: event.args.sender as Hex,
    tickLower: Number(event.args.tickLower),
    tickUpper: Number(event.args.tickUpper),
    liquidityDelta: event.args.liquidityDelta as bigint,
    txHash: event.transaction.hash,
    ts: Number(event.block.timestamp),
  });
});

// ------------------------------------------------------------------ admin events
async function recordAdmin(
  event: any,
  context: any,
  type: string,
  data: Record<string, unknown>,
) {
  await context.db.insert(adminEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    type,
    data: JSON.parse(
      JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    ),
    txHash: event.transaction.hash,
    ts: Number(event.block.timestamp),
    block: Number(event.block.number),
  });
}

ponder.on("COURFactory:StockSet", async ({ event, context }) => {
  const a = event.args;
  await context.db
    .insert(stock)
    .values({
      address: a.stock as Hex,
      allowed: a.allowed as boolean,
      refPool: a.refPool as Hex,
      refKind: Number(a.refKind),
    })
    .onConflictDoUpdate(() => ({
      allowed: a.allowed as boolean,
      refPool: a.refPool as Hex,
      refKind: Number(a.refKind),
    }));
  await recordAdmin(event, context, "StockSet", {
    stock: a.stock,
    allowed: a.allowed,
    refPool: a.refPool,
    refKind: a.refKind,
  });
});

ponder.on("COURFactory:LaunchParamsSet", async ({ event, context }) => {
  const a = event.args;
  await recordAdmin(event, context, "LaunchParamsSet", {
    startMcUsd: a.startMcUsd,
    gradMcUsd: a.gradMcUsd,
    minRefLiqUsd: a.minRefLiqUsd,
    launchFee: a.launchFee,
  });
});

ponder.on("COURFactory:LaunchesPausedSet", async ({ event, context }) => {
  await recordAdmin(event, context, "LaunchesPausedSet", {
    paused: event.args.paused,
  });
});

ponder.on("COURFactory:LaunchAllowlistSet", async ({ event, context }) => {
  const a = event.args;
  await recordAdmin(event, context, "LaunchAllowlistSet", {
    account: a.account,
    allowed: a.allowed,
  });
});

ponder.on("COURFactory:LaunchAllowlistEnabledSet", async ({ event, context }) => {
  await recordAdmin(event, context, "LaunchAllowlistEnabledSet", {
    enabled: event.args.enabled,
  });
});

ponder.on("COURFeeVault:TreasurySet", async ({ event, context }) => {
  await recordAdmin(event, context, "TreasurySet", {
    treasury: event.args.treasury,
  });
});

ponder.on("COURRouter:EthInPathSet", async ({ event, context }) => {
  const a = event.args;
  await recordAdmin(event, context, "EthInPathSet", {
    stock: a.stock,
    path: a.path,
  });
});
