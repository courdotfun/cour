// Analytics aggregations derived purely from indexer data. No fabricated values;
// every number is a function of the events passed in.
import type { TokenRow, TradeRow } from "../shared/types.ts";

// ---- volume bucketed by time interval -------------------------------------
export interface VolumeBucket {
  bucketTs: number;
  volumeUsd: number;
  trades: number;
  buys: number;
  sells: number;
}

export function volumeByInterval(trades: TradeRow[], intervalSec: number): VolumeBucket[] {
  if (intervalSec <= 0) throw new Error("intervalSec must be > 0");
  const map = new Map<number, VolumeBucket>();
  for (const t of trades) {
    const bucket = Math.floor(t.ts / intervalSec) * intervalSec;
    const b = map.get(bucket) ?? { bucketTs: bucket, volumeUsd: 0, trades: 0, buys: 0, sells: 0 };
    const usd = t.priceUsd != null ? Math.abs(Number(t.tokenAmount) / 1e18) * t.priceUsd : 0;
    b.volumeUsd += usd;
    b.trades += 1;
    if (t.side === "buy") b.buys += 1;
    else b.sells += 1;
    map.set(bucket, b);
  }
  return [...map.values()].sort((a, b) => a.bucketTs - b.bucketTs);
}

// ---- unique-holder / trader growth ----------------------------------------
// Cumulative count of distinct traders seen over time (first-seen per address).
export function traderGrowth(trades: TradeRow[]): { ts: number; uniqueTraders: number }[] {
  const seen = new Set<string>();
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  const out: { ts: number; uniqueTraders: number }[] = [];
  for (const t of sorted) {
    seen.add(t.trader.toLowerCase());
    out.push({ ts: t.ts, uniqueTraders: seen.size });
  }
  return out;
}

// ---- fee distribution by token mode ---------------------------------------
// Sums fee (raw) grouped by the token's fee mode; the mode label tells where the
// fee is routed (creator / holders / buyback). Pure accounting of indexed fees.
export const MODE_LABELS = ["CREATOR", "HOLDERS", "BUYBACK", "BUYBACK_BURN"] as const;

export function feeDistribution(trades: TradeRow[], modeOf: (token: string) => number): Record<string, bigint> {
  const acc: Record<string, bigint> = {};
  for (const label of MODE_LABELS) acc[label] = 0n;
  for (const t of trades) {
    const label = MODE_LABELS[modeOf(t.token)] ?? "CREATOR";
    acc[label] += BigInt(t.fee || "0");
  }
  return acc;
}

// ---- launch → graduation funnel -------------------------------------------
export interface Funnel {
  launched: number;
  graduated: number;
  graduationRate: number; // 0..1
  medianProgressBps: number;
}

export function launchFunnel(tokens: TokenRow[]): Funnel {
  const launched = tokens.length;
  const graduated = tokens.filter((t) => t.graduated).length;
  const progresses = tokens.map((t) => t.progressBps).sort((a, b) => a - b);
  const median = progresses.length ? progresses[Math.floor(progresses.length / 2)] : 0;
  return {
    launched,
    graduated,
    graduationRate: launched ? graduated / launched : 0,
    medianProgressBps: median,
  };
}

// ---- top movers by 24h-ish price change (needs candles upstream) ----------
export function topMovers(
  tokens: TokenRow[],
  changeOf: (token: string) => number | null,
  limit = 10,
): { token: string; symbol: string; changePct: number }[] {
  return tokens
    .map((t) => ({ token: t.address, symbol: (t.symbol || "TOKEN").toUpperCase(), changePct: changeOf(t.address) ?? 0 }))
    .filter((x) => Number.isFinite(x.changePct) && x.changePct !== 0)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, limit);
}
