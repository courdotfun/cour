import type { Context } from "ponder:registry";
import { candle, stockPrice } from "ponder:schema";
import type { Hex } from "viem";

import { COURPriceReaderAbi } from "../abis/COURPriceReader";
import { PRICE_READER } from "./addresses";

const WAD = 10n ** 18n;

export const INTERVALS: { label: string; size: number }[] = [
  { label: "1m", size: 60 },
  { label: "5m", size: 300 },
  { label: "1h", size: 3600 },
  { label: "1d", size: 86400 },
];

// Per-block cache of stockUsd reads so we hit the RPC at most once per (stock, block).
const stockUsdCache = new Map<string, bigint | null>();

/**
 * Read PriceReader.stockUsd(stock) (1e18-scaled USD per whole stock), cached per
 * (stock, block). Returns null when the TWAP is not ready (contract reverts) so
 * callers can keep stock-denominated values and skip USD.
 */
export async function getStockUsdX18(
  context: Context,
  stock: Hex,
  block: bigint,
  ts: number,
): Promise<bigint | null> {
  const key = `${stock.toLowerCase()}-${block}`;
  if (stockUsdCache.has(key)) return stockUsdCache.get(key)!;

  let priceX18: bigint | null = null;
  try {
    const res = (await context.client.readContract({
      abi: COURPriceReaderAbi,
      address: PRICE_READER,
      functionName: "stockUsd",
      args: [stock],
    })) as readonly [bigint, number];
    priceX18 = res[0];
  } catch {
    priceX18 = null; // TwapNotReady / StockNotAllowed
  }

  stockUsdCache.set(key, priceX18);

  if (priceX18 !== null) {
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
