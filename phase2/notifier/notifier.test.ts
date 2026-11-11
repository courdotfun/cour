import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenEvents, tradeEvents, advanceCursors, type Cursors } from "./events.ts";
import { matches, render, runRules, type Rule } from "./rules.ts";
import { deliver, type Transport } from "./channels.ts";
import { tick, type Store, type State } from "./index.ts";
import type { TokenRow, TradeRow, Hex } from "../shared/types.ts";

const A = (n: number) => (`0x${n.toString(16).padStart(40, "0")}`) as Hex;

function token(partial: Partial<TokenRow>): TokenRow {
  return {
    address: A(1), curve: A(2), name: "T", symbol: "T", creator: A(9), stock: A(3), stockDecimals: 18,
    feeBps: 400, mode: 0, launchedAt: 100, launchBlock: 1, graduated: false, graduatedAt: null,
    poolId: null, positionId: null, vS: "0", vT: "0", progressBps: 0, lastPriceStock: 0,
    lastPriceUsd: 1, volumeStock: 0, volumeUsd: 0, tradeCount: 0, lastTradeAt: null, ...partial,
  };
}
function trade(partial: Partial<TradeRow>): TradeRow {
  return {
    id: "t1", token: A(1), source: "curve", side: "buy", trader: A(7), stockAmount: "0",
    tokenAmount: (1000n * 10n ** 18n).toString(), fee: "0", tax: "0", priceStock: 0, priceUsd: 2,
    txHash: A(8) as Hex, logIndex: 0, ts: 200, block: 1, ...partial,
  };
}

test("tokenEvents emits launches past the cursor only", () => {
  const cursors: Cursors = { lastLaunchTs: 150, lastGraduationTs: 0 };
  const evs = tokenEvents([token({ address: A(1), launchedAt: 100 }), token({ address: A(2), launchedAt: 200, symbol: "NEW" })], cursors);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].kind, "launch");
  assert.equal(evs[0].symbol, "NEW");
});

test("tokenEvents emits graduation once past cursor", () => {
  const evs = tokenEvents([token({ graduated: true, graduatedAt: 500, symbol: "G" })], { lastLaunchTs: 1e9, lastGraduationTs: 400 });
  assert.equal(evs.filter((e) => e.kind === "graduation").length, 1);
});

test("tradeEvents computes USD notional from token amount * priceUsd", () => {
  const evs = tradeEvents([trade({ tokenAmount: (1000n * 10n ** 18n).toString(), priceUsd: 2 })], () => "T");
  assert.equal(evs[0].kind, "large_trade");
  assert.equal(evs[0].usd, 2000);
});

test("matches respects kind, minUsd, creators, tokens", () => {
  const ev = { id: "x", kind: "large_trade" as const, token: A(1), symbol: "T", ts: 1, usd: 500 };
  assert.ok(matches(ev, { id: "r", kind: "large_trade", minUsd: 100, channel: "telegram", target: "c" }));
  assert.ok(!matches(ev, { id: "r", kind: "large_trade", minUsd: 1000, channel: "telegram", target: "c" }));
  assert.ok(!matches(ev, { id: "r", kind: "launch", channel: "telegram", target: "c" }));
});

test("render produces human messages", () => {
  assert.match(render({ id: "a", kind: "launch", token: A(1), symbol: "ABC", ts: 1 }), /New launch: \$ABC/);
  assert.match(render({ id: "b", kind: "graduation", token: A(1), symbol: "ABC", ts: 1 }), /graduated/);
});

test("runRules dedupes per (event, rule) and is idempotent", () => {
  const events = [{ id: "launch:1", kind: "launch" as const, token: A(1), symbol: "ABC", ts: 1, creator: A(9) }];
  const rules: Rule[] = [{ id: "r1", kind: "launch", channel: "telegram", target: "chat" }];
  const first = runRules(events, rules, new Set());
  assert.equal(first.notifications.length, 1);
  const second = runRules(events, rules, first.seen);
  assert.equal(second.notifications.length, 0, "already-seen event must not re-notify");
});

test("deliver captures per-notification failures without throwing", async () => {
  const good: Transport = { async send() { return "mid"; } };
  const bad: Transport = { async send() { throw new Error("boom"); } };
  const notes = [
    { eventId: "e1", rule: { id: "r1", kind: "launch", channel: "telegram", target: "c" } as Rule, message: "m" },
    { eventId: "e2", rule: { id: "r2", kind: "launch", channel: "webpush", target: "s" } as Rule, message: "m" },
  ];
  const res = await deliver(notes, { telegram: good, webpush: bad });
  assert.equal(res[0].ok, true);
  assert.equal(res[1].ok, false);
  assert.match(res[1].info, /boom/);
});

test("advanceCursors moves forward only", () => {
  const next = advanceCursors({ lastLaunchTs: 10, lastGraduationTs: 10 }, [
    { id: "l", kind: "launch", token: A(1), symbol: "T", ts: 20 },
    { id: "g", kind: "graduation", token: A(1), symbol: "T", ts: 5 },
  ]);
  assert.equal(next.lastLaunchTs, 20);
  assert.equal(next.lastGraduationTs, 10);
});

test("tick: only persists seen for successfully delivered notifications", async () => {
  let state: State = { seen: [], cursors: { lastLaunchTs: 0, lastGraduationTs: 0 } };
  const store: Store = { async load() { return state; }, async save(s) { state = s; } };
  const client = {
    async tokens() { return { filter: "new", tokens: [token({ address: A(5), launchedAt: 100, symbol: "NEW" })] }; },
    async trades() { return { trades: [] as TradeRow[] }; },
  };
  // transport fails first → seen must NOT persist, so it retries next tick.
  let attempts = 0;
  const flaky: Transport = { async send() { attempts++; if (attempts === 1) throw new Error("net"); return "ok"; } };
  const rules: Rule[] = [{ id: "r1", kind: "launch", channel: "telegram", target: "chat" }];
  const deps = { client: client as any, rules, channels: { telegram: flaky }, store };

  const r1 = await tick(deps);
  assert.equal(r1.delivered, 0, "first send failed");
  assert.equal(state.seen.length, 0, "failed send not marked seen");

  const r2 = await tick(deps);
  assert.equal(r2.delivered, 1, "retried and delivered");
  assert.equal(state.seen.length, 1, "now marked seen");

  const r3 = await tick(deps);
  assert.equal(r3.delivered, 0, "no duplicate on third tick");
});
