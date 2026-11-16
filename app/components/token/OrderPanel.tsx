"use client";
import { useState } from "react";
import type { UiToken } from "@/lib/live/map";
import { toRaw, fromRaw } from "@/lib/ui/format";
import { previewBuy, previewSell, buy, sell } from "@/lib/features/trade";
import { connect, getWallet } from "@/lib/chain/wallet";
import { erc20Balance, nativeBalance } from "@/lib/data/onchain";

async function ensureConnected(): Promise<string> {
  const w = getWallet();
  if (w.address) return w.address;
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found");
  const s = await connect(eth);
  if (!s.address) throw new Error("Connect failed");
  return s.address;
}

export function OrderPanel({ t }: { t: UiToken }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit">("market");
  const [amt, setAmt] = useState("");
  const [quote, setQuote] = useState<string>("—");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // buy pays with the paired stock; sell returns the paired stock.
  const unit = side === "buy" ? t.pair : t.tick;

  async function recalc(v: string) {
    setAmt(v);
    setMsg(null);
    const n = parseFloat(v);
    if (!isFinite(n) || n <= 0) {
      setQuote("—");
      return;
    }
    try {
      if (side === "buy") {
        const q = await previewBuy(t.address, toRaw(v, t.stockDecimals));
        setQuote(`${fromRaw(q.amountOut, 18).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t.tick}`);
      } else {
        const q = await previewSell(t.address, toRaw(v, 18));
        setQuote(`${fromRaw(q.amountOut, t.stockDecimals).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${t.pair}`);
      }
    } catch {
      setQuote("—");
    }
  }

  async function submit() {
    setMsg(null);
    const n = parseFloat(amt);
    if (!isFinite(n) || n <= 0) return;
    setBusy(true);
    try {
      await ensureConnected();
      let hash: string;
      if (side === "buy") {
        const stockIn = toRaw(amt, t.stockDecimals);
        const q = await previewBuy(t.address, stockIn);
        hash = await buy(t.address, t.pairedStock, stockIn, q.minOut);
      } else {
        const tokensIn = toRaw(amt, 18);
        const q = await previewSell(t.address, tokensIn);
        hash = await sell(t.address, tokensIn, q.minOut);
      }
      setMsg(`Done: ${hash.slice(0, 10)}…`);
      setAmt("");
      setQuote("—");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Trade failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="tk-side">
      <div className="tk-card tk-order">
        <div className="ord-side">
          <button className={side === "buy" ? "on" : ""} data-s="buy" onClick={() => { setSide("buy"); setQuote("—"); }}>Buy</button>
          <button className={side === "sell" ? "on" : ""} data-s="sell" onClick={() => { setSide("sell"); setQuote("—"); }}>Sell</button>
        </div>
        <div className="ord-type">
          <button className={type === "market" ? "on" : ""} onClick={() => setType("market")}>Market</button>
          <button className={type === "limit" ? "on" : ""} onClick={() => setType("limit")} title="Coming soon">Limit</button>
        </div>
        {type === "limit" ? (
          <div className="ord-soon" style={{ color: "var(--muted)", padding: "14px 2px", fontSize: 13 }}>
            Limit orders are coming soon.
          </div>
        ) : (
          <>
            <label className="ord-lab">Amount</label>
            <div className="ord-in">
              <input id="ordAmt" placeholder="0.0" inputMode="decimal" value={amt} onChange={(e) => recalc(e.target.value)} />
              <span className="ord-unit">{unit}</span>
            </div>
            <div className="ord-pct">
              <button onClick={() => recalc(amt)}>25%</button>
              <button onClick={() => recalc(amt)}>50%</button>
              <button onClick={() => recalc(amt)}>75%</button>
              <button onClick={() => recalc(amt)}>Max</button>
            </div>
            <div className="ord-sum">
              <span>You receive</span>
              <span className="ord-sum-v" id="ordCost">{quote}</span>
            </div>
            <button className={`ord-submit ${side}`} id="ordBtn" disabled={busy} onClick={submit}>
              {busy ? "…" : side === "buy" ? `Buy ${t.tick}` : `Sell ${t.tick}`}
            </button>
            {msg && <div className="ord-msg" style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>{msg}</div>}
            <div className="ord-meta">
              <span id="ordVenue">Market order · pays {t.pair}</span>
              <span data-net>Robinhood Chain</span>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
