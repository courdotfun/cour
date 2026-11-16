"use client";
import { useState } from "react";
import type { TradeRow, HolderRow } from "@/lib/data/types";
import { fromRaw, shortAddr } from "@/lib/ui/format";

const SUPPLY = 1_000_000_000;

function ago(ts: number): string {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

export function TradesHolders({
  trades,
  holders,
  stockDecimals,
}: {
  trades: TradeRow[];
  holders: HolderRow[];
  stockDecimals: number;
}) {
  const [tab, setTab] = useState<"trades" | "holders">("trades");
  return (
    <div className="tk-card">
      <div className="tk-tabs">
        <button className={`tk-tab${tab === "trades" ? " on" : ""}`} onClick={() => setTab("trades")}>Recent trades</button>
        <button className={`tk-tab${tab === "holders" ? " on" : ""}`} onClick={() => setTab("holders")}>Holders</button>
      </div>
      <div id="tkTradeList" className="tk-list">
        {tab === "trades" ? (
          trades.length === 0 ? (
            <div className="tk-empty">No trades yet.</div>
          ) : (
            trades.map((t) => (
              <div key={t.id} className={`tk-trow ${t.side}`}>
                <span className={`tk-tside ${t.side}`}>{t.side === "buy" ? "Buy" : "Sell"}</span>
                <a className="tk-ttrader" href={`/u/${t.trader}`}>{shortAddr(t.trader)}</a>
                <span className="tk-tamt">{fromRaw(BigInt(t.tokenAmount), 18).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="tk-tval">{fromRaw(BigInt(t.stockAmount), stockDecimals).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                <span className="tk-ttime">{ago(t.ts)}</span>
              </div>
            ))
          )
        ) : holders.length === 0 ? (
          <div className="tk-empty">No holders yet.</div>
        ) : (
          holders.map((h) => {
            const bal = fromRaw(BigInt(h.balance), 18);
            const pct = (bal / SUPPLY) * 100;
            return (
              <div key={h.id} className="tk-hrow">
                <a className="tk-haddr" href={`/u/${h.address}`}>{shortAddr(h.address)}</a>
                <span className="tk-hbal">{bal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="tk-hpct">{pct.toFixed(2)}%</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
