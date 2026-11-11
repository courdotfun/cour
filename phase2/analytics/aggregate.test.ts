import { test } from "node:test";
import assert from "node:assert/strict";
import { volumeByInterval, traderGrowth, feeDistribution, launchFunnel, topMovers } from "./aggregate.ts";
import type { TokenRow, TradeRow, Hex } from "../shared/types.ts";

const A = (n: number) => (`0x${n.toString(16).padStart(40, "0")}`) as Hex;

function trade(partial: Partial<TradeRow>): TradeRow {
  return {
    id: Math.random().toString(36).slice(2), token: A(1), source: "curve", side: "buy", trader: A(7),
    stockAmount: "0", tokenAmount: (1n * 10n ** 18n).toString(), fee: "100", tax: "0", priceStock: 0,
    priceUsd: 1, txHash: A(8) as Hex, logIndex: 0, ts: 0, block: 1, ...partial,
  };
}
function token(partial: Partial<TokenRow>): TokenRow {
  return {
    address: A(1), curve: A(2), name: "T", symbol: "T", creator: A(9), stock: A(3), stockDecimals: 18,
    feeBps: 400, mode: 0, launchedAt: 0, launchBlock: 1, graduated: false, graduatedAt: null, poolId: null,
    positionId: null, vS: "0", vT: "0", progressBps: 0, lastPriceStock: 0, lastPriceUsd: 1, volumeStock: 0,
    volumeUsd: 0, tradeCount: 0, lastTradeAt: null, ...partial,
  };
}

test("volumeByInterval buckets by interval and splits buys/sells", () => {
  const trades = [
    trade({ ts: 0, side: "buy", tokenAmount: (10n * 10n ** 18n).toString(), priceUsd: 2 }), // $20
    trade({ ts: 30, side: "sell", tokenAmount: (5n * 10n ** 18n).toString(), priceUsd: 2 }), // $10 same bucket (60s)
    trade({ ts: 90, side: "buy", tokenAmount: (1n * 10n ** 18n).toString(), priceUsd: 2 }), // $2 next bucket
  ];
  const buckets = volumeByInterval(trades, 60);
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].bucketTs, 0);
  assert.equal(buckets[0].volumeUsd, 30);
  assert.equal(buckets[0].buys, 1);
  assert.equal(buckets[0].sells, 1);
  assert.equal(buckets[1].volumeUsd, 2);
});

test("volumeByInterval rejects non-positive interval", () => {
  assert.throws(() => volumeByInterval([], 0));
});

test("traderGrowth counts distinct traders cumulatively in time order", () => {
  const g = traderGrowth([
    trade({ ts: 10, trader: A(1) }),
    trade({ ts: 5, trader: A(2) }),
    trade({ ts: 20, trader: A(1) }), // repeat → no growth
  ]);
  assert.deepEqual(g.map((x) => x.uniqueTraders), [1, 2, 2]);
  assert.equal(g[0].ts, 5, "sorted by time");
});

test("feeDistribution groups raw fees by token mode", () => {
  const modeOf = (t: string) => (t === A(1).toLowerCase() ? 1 : 2);
  const dist = feeDistribution(
    [trade({ token: A(1), fee: "100" }), trade({ token: A(2), fee: "250" })],
    (t) => modeOf(t.toLowerCase()),
  );
  assert.equal(dist.HOLDERS, 100n);
  assert.equal(dist.BUYBACK, 250n);
  assert.equal(dist.CREATOR, 0n);
});

test("launchFunnel computes graduation rate + median progress", () => {
  const f = launchFunnel([
    token({ graduated: true, progressBps: 10000 }),
    token({ graduated: false, progressBps: 2000 }),
    token({ graduated: false, progressBps: 6000 }),
  ]);
  assert.equal(f.launched, 3);
  assert.equal(f.graduated, 1);
  assert.ok(Math.abs(f.graduationRate - 1 / 3) < 1e-9);
  assert.equal(f.medianProgressBps, 6000);
});

test("topMovers sorts by absolute change and respects limit", () => {
  const changes: Record<string, number> = { [A(1).toLowerCase()]: 5, [A(2).toLowerCase()]: -40, [A(3).toLowerCase()]: 0 };
  const movers = topMovers(
    [token({ address: A(1), symbol: "a" }), token({ address: A(2), symbol: "b" }), token({ address: A(3), symbol: "c" })],
    (t) => changes[t.toLowerCase()] ?? null,
    2,
  );
  assert.equal(movers.length, 2);
  assert.equal(movers[0].symbol, "B", "biggest absolute move first");
  assert.equal(movers[0].changePct, -40);
});
