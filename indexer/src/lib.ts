import type { Context } from "ponder:registry";
import { candle, stockPrice } from "ponder:schema";
import { createPublicClient, http, type Hex } from "viem";

import { COURPriceReaderAbi } from "../abis/COURPriceReader";
import { PRICE_READER } from "./addresses";

const WAD = 10n ** 18n;

// Standalone client used ONLY for stockUsd reads. We read at the LATEST block
// (not the event's historical block) because PriceReader.stockUsd needs current
// state and the public RPC is NOT an archive node — a historical eth_call there
// fails ("invalid parameters") and Ponder retries for minutes, stalling backfill.
// Reading latest succeeds on any node. Trade-off: during historical backfill,
// trades are valued at the CURRENT stock/USD rate (an approximation; the
// stock-denominated price `priceStock` remains exact). With an ARCHIVE RPC you
// could restore exact per-block USD by reading at the event block instead.
const STOCK_USD_RPC = process.env.PONDER_RPC_URL_4663;
/**
 * Shared client that reads at the LATEST block (not pinned to an event's historical
 * block like Ponder's `context.client`). Use this for handler reads of IMMUTABLE
 * on-chain data (curve config, token name/symbol, decimals) so backfill works on a
 * NON-ARCHIVE RPC — latest == historical for immutable values. Null if no RPC env.
 */
export const latestClient = STOCK_USD_RPC
  ? createPublicClient({ transport: http(STOCK_USD_RPC) })
  : null;
const STOCK_USD_TTL_MS = 60_000; // re-read a stock's USD price at most once/min

export const INTERVALS: { label: string; size: number }[] = [
  { label: "1m", size: 60 },
  { label: "5m", size: 300 },
  { label: "1h", size: 3600 },
  { label: "1d", size: 86400 },
];

// Cache of stockUsd reads per stock, with a short wall-clock TTL. Reads hit the
// RPC at LATEST (see note above) so this is a handful of calls during backfill.
const stockUsdCache = new Map<string, { priceX18: bigint | null; at: number }>();

// Stocks seen in TokenLaunched — the realtime block poll snapshots each of these.
export const trackedStocks = new Set<string>();

// Latest stockUsd SNAPSHOT per stock, written by the realtime block-interval poll
// (see index.ts "StockUsdPoll:block"). Realtime trades value USD using the most
// recent snapshot at/just-before the trade (not a fresh per-trade read). Keyed by
// lowercased stock address -> { ts, priceX18 }.
const stockSnapshot = new Map<string, { ts: number; priceX18: bigint }>();

/**
 * USD price (1e18) to value a TRADE at `ts`. Prefers the nearest realtime snapshot
 * (from the block poll); if none exists yet (e.g. during historical backfill), falls
 * back to reading the current price (documented approximation). Returns null if
 * unavailable. Also records the fallback read as a snapshot/stockPrice row.
 */
export async function getStockUsdForTrade(
  context: Context,
  stock: Hex,
  ts: number,
): Promise<bigint | null> {
  const snap = stockSnapshot.get(stock.toLowerCase());
  if (snap) return snap.priceX18;
  return getStockUsdX18(context, stock, 0n, ts); // backfill fallback: current price
}

/**
 * Read PriceReader.stockUsd(stock) (1e18-scaled USD per whole stock) at the LATEST
 * block, cached per stock (60s TTL). Returns null when the TWAP is not ready
 * (contract reverts) or no RPC is configured, so callers keep stock-denominated
 * values and skip USD. `block` is accepted for signature stability but not used
 * (latest-read; see the module note on archive vs non-archive RPC).
 */
export async function getStockUsdX18(
  context: Context,
  stock: Hex,
  block: bigint,
  ts: number,
): Promise<bigint | null> {
  const key = stock.toLowerCase();
  const now = Date.now();
  const cached = stockUsdCache.get(key);
  let priceX18: bigint | null;
  if (cached && now - cached.at < STOCK_USD_TTL_MS) {
    priceX18 = cached.priceX18;
  } else {
    priceX18 = null;
    if (latestClient) {
      try {
        const res = (await latestClient.readContract({
          abi: COURPriceReaderAbi,
          address: PRICE_READER,
          functionName: "stockUsd",
          args: [stock],
        })) as readonly [bigint, number];
        priceX18 = res[0];
      } catch {
        priceX18 = null; // TwapNotReady / StockNotAllowed / transient
      }
    }
    stockUsdCache.set(key, { priceX18, at: now });
  }

  if (priceX18 !== null) {
    // Keep the realtime snapshot used by trades fresh.
    stockSnapshot.set(key, { ts, priceX18 });
    const bucketTs = Math.floor(ts / 60) * 60;
    await context.db
      .insert(stockPrice)
      .values({
        id: `${stock.toLowerCase()}-${bucketTs}`,
        stock,
        priceUsdX18: priceX18,
        ts: bucketTs,
      })
      .onConflictDoNothing();
  }
  return priceX18;
}

/** USD per whole stock token as a float, from the 1e18-scaled value. */
export function stockUsdFloat(priceX18: bigint | null): number | null {
  if (priceX18 === null) return null;
  return Number(priceX18) / 1e18;
}

/**
 * Whole-unit price in stock (stock per token), from the on-chain 1e18-scaled
 * priceX18 = vS * 1e18 / vT (raw units). Token is always 18 decimals.
 */
export function priceStockWhole(priceX18: bigint, stockDecimals: number): number {
  // whole = (vS/10^sdec) / (vT/10^18) = (priceX18/1e18) * 10^(18 - sdec)
  return (Number(priceX18) / 1e18) * 10 ** (18 - stockDecimals);
}

/** priceX18 = vS * 1e18 / vT (matches CurveMath.priceX18). */
export function priceX18FromReserves(vS: bigint, vT: bigint): bigint {
  if (vT === 0n) return 0n;
  return (vS * WAD) / vT;
}

/** Raw stock amount (stockDecimals) to a float of whole tokens. */
export function toWhole(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/**
 * Fold a trade into every candle interval for `token`.
 * priceStock / priceUsd are whole-unit prices (priceUsd may be null).
 */
export async function updateCandles(
  context: Context,
  tokenAddr: Hex,
  ts: number,
  priceStock: number,
  priceUsd: number | null,
  volStock: number,
  volUsd: number,
): Promise<void> {
  for (const { label, size } of INTERVALS) {
    const bucketTs = Math.floor(ts / size) * size;
    const id = `${tokenAddr.toLowerCase()}-${label}-${bucketTs}`;
    await context.db
      .insert(candle)
      .values({
        id,
        token: tokenAddr,
        interval: label,
        bucketTs,
        openStock: priceStock,
        highStock: priceStock,
        lowStock: priceStock,
        closeStock: priceStock,
        openUsd: priceUsd,
        highUsd: priceUsd,
        lowUsd: priceUsd,
        closeUsd: priceUsd,
        volumeStock: volStock,
        volumeUsd: volUsd,
        ts: bucketTs,
      })
      .onConflictDoUpdate((row) => ({
        highStock: Math.max(row.highStock, priceStock),
        lowStock: Math.min(row.lowStock, priceStock),
        closeStock: priceStock,
        highUsd:
          priceUsd === null
            ? row.highUsd
            : row.highUsd === null
              ? priceUsd
              : Math.max(row.highUsd, priceUsd),
        lowUsd:
          priceUsd === null
            ? row.lowUsd
            : row.lowUsd === null
              ? priceUsd
              : Math.min(row.lowUsd, priceUsd),
        closeUsd: priceUsd === null ? row.closeUsd : priceUsd,
        openUsd: row.openUsd === null ? priceUsd : row.openUsd,
        volumeStock: row.volumeStock + volStock,
        volumeUsd: row.volumeUsd + volUsd,
      }));
  }
}

export { WAD };
