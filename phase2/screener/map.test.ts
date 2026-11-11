import { test } from "node:test";
import assert from "node:assert/strict";
import { toDexScreenerPair, toDexScreenerEvents, toGeckoPool, toGeckoOhlcv, CHAIN_ID } from "./map.ts";
import type { TokenRow, TradeRow, CandleRow, Hex } from "../shared/types.ts";

const A = (n: number) => (`0x${n.toString(16).padStart(40, "0")}`) as Hex;
const P = ("0x" + "ab".repeat(32)) as Hex;

function token(partial: Partial<TokenRow>): TokenRow {
  return {
    address: A(1), curve: A(2), name: "Nova", symbol: "nova", creator: A(9), stock: A(3), stockDecimals: 18,
    feeBps: 400, mode: 0, launchedAt: 1700000000, launchBlock: 1, graduated: false, graduatedAt: null,
    poolId: null, positionId: null, vS: (1000n * 10n ** 18n).toString(), vT: "0", progressBps: 2500,
    lastPriceStock: 0.000001, lastPriceUsd: 0.0002, volumeStock: 10, volumeUsd: 2000, tradeCount: 42,
    lastTradeAt: null, stockSymbol: "NVDA", ...partial,
  };
}

test("pre-graduation pair uses the curve address as pairId, symbol upcased", () => {
  const p = toDexScreenerPair(token({}));
  assert.equal(p.chainId, CHAIN_ID);
  assert.equal(p.pairId, A(2).toLowerCase());
  assert.equal(p.baseToken.symbol, "NOVA");
  assert.equal(p.quoteToken.symbol, "NVDA");
  assert.equal(p.graduated, false);
  assert.equal(p.lpBurned, false);
  assert.equal(p.priceUsd, 0.0002);
});

test("post-graduation pair uses poolId and reports LP burned", () => {
  const p = toDexScreenerPair(token({ graduated: true, graduatedAt: 1700000500, poolId: P }));
  assert.equal(p.pairId, P.toLowerCase());
  assert.equal(p.graduated, true);
  assert.equal(p.lpBurned, true, "graduated COUR pools have burned LP");
});

test("liquidityUsd is finite and non-negative", () => {
  const p = toDexScreenerPair(token({}));
  assert.ok(Number.isFinite(p.liquidityUsd));
  assert.ok(p.liquidityUsd >= 0);
});

test("events map txnId as txHash:logIndex and carry side", () => {
  const trades: TradeRow[] = [
    { id: "x", token: A(1), source: "curve", side: "sell", trader: A(7), stockAmount: "5", tokenAmount: "9", fee: "0", tax: "0", priceStock: 0, priceUsd: 0.0002, txHash: P, logIndex: 3, ts: 1, block: 99 },
  ];
  const evs = toDexScreenerEvents(trades, () => "pairx");
  assert.equal(evs[0].txnId, `${P}:3`);
  assert.equal(evs[0].side, "sell");
  assert.equal(evs[0].blockNumber, 99);
  assert.equal(evs[0].pairId, "pairx");
});

test("gecko pool shape + ohlcv ordering", () => {
  const pool = toGeckoPool(token({}));
  assert.equal(pool.type, "pool");
  assert.match(pool.attributes.name, /NOVA \/ NVDA/);
  assert.equal(pool.attributes.base_token_price_usd, "0.0002");

  const candles: CandleRow[] = [
    { token: A(1), interval: "1h", bucketTs: 100, openUsd: 1, highUsd: 2, lowUsd: 0.5, closeUsd: 1.5, volumeUsd: 10, ts: 100 },
    { token: A(1), interval: "1h", bucketTs: 200, openUsd: null, highUsd: null, lowUsd: null, closeUsd: null, volumeUsd: 0, ts: 200 },
  ];
  const ohlcv = toGeckoOhlcv(candles);
  assert.equal(ohlcv.length, 1, "null-close candles are dropped");
  assert.deepEqual(ohlcv[0], [100, 1, 2, 0.5, 1.5, 10]);
});
