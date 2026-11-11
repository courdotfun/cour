// Derive normalized notification events from Phase-1 indexer data. Pure: no IO.
import type { TokenRow, TradeRow, Hex } from "../shared/types.ts";

export type NotifKind = "launch" | "graduation" | "large_trade";

export interface NotifEvent {
  id: string; // stable, dedupe key
  kind: NotifKind;
  token: Hex;
  symbol: string;
  ts: number;
  usd?: number;
  trader?: Hex;
  creator?: Hex;
  side?: "buy" | "sell";
}

export interface Cursors {
  lastLaunchTs: number;
  lastGraduationTs: number;
}

// New-launch + graduation events from the token list.
export function tokenEvents(tokens: TokenRow[], cursors: Cursors): NotifEvent[] {
  const out: NotifEvent[] = [];
  for (const t of tokens) {
    const sym = (t.symbol || "TOKEN").toUpperCase();
    if (t.launchedAt > cursors.lastLaunchTs) {
      out.push({ id: `launch:${t.address.toLowerCase()}`, kind: "launch", token: t.address, symbol: sym, ts: t.launchedAt, creator: t.creator });
    }
    if (t.graduated && t.graduatedAt && t.graduatedAt > cursors.lastGraduationTs) {
      out.push({ id: `grad:${t.address.toLowerCase()}`, kind: "graduation", token: t.address, symbol: sym, ts: t.graduatedAt });
    }
  }
  return out;
}

// Large-trade events from the trade feed (USD notional >= floor handled by rules).
export function tradeEvents(trades: TradeRow[], symbolOf: (token: Hex) => string): NotifEvent[] {
  const out: NotifEvent[] = [];
  for (const tr of trades) {
    const usd = tr.priceUsd != null ? Math.abs(Number(tr.tokenAmount) / 1e18) * tr.priceUsd : undefined;
    out.push({
      id: `trade:${tr.id}`,
      kind: "large_trade",
      token: tr.token,
      symbol: symbolOf(tr.token),
      ts: tr.ts,
      usd,
      trader: tr.trader,
      side: tr.side,
    });
  }
  return out;
}

// Advance cursors past the newest event of each kind we have observed.
export function advanceCursors(prev: Cursors, events: NotifEvent[]): Cursors {
  let lastLaunchTs = prev.lastLaunchTs;
  let lastGraduationTs = prev.lastGraduationTs;
  for (const e of events) {
    if (e.kind === "launch" && e.ts > lastLaunchTs) lastLaunchTs = e.ts;
    if (e.kind === "graduation" && e.ts > lastGraduationTs) lastGraduationTs = e.ts;
  }
  return { lastLaunchTs, lastGraduationTs };
}
