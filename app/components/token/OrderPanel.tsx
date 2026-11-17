"use client";
import { useState } from "react";
import type { UiToken } from "@/lib/live/map";
import { connect, getWallet } from "@/lib/chain/wallet";

async function ensureConnected(): Promise<string> {
  const w = getWallet();
  if (w.address) return w.address;
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found");
  const s = await connect(eth);
  if (!s.address) throw new Error("Connect failed");
  return s.address;
}

// Visual port of v8's token order panel in its disconnected default state (no wallet)
// — which is also the correct real default. Markup mirrors design/cour-v8.html's
// JS-rendered `.tk-side` exactly (captured + verified with test/stylediff.mjs). Full
// interactivity (balances, live route/quote) is wired on top of this structure later.
export function OrderPanel({ t }: { t: UiToken }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [type, setType] = useState<"market" | "limit">("market");
  const onConnect = () => { ensureConnected().catch(() => {}); };

  return (
    <aside className="tk-side">
      <div className="tk-card tk-order">
        <div className="ord-side">
          <button className={side === "buy" ? "on" : undefined} data-s="buy" onClick={() => setSide("buy")}>Buy</button>
          <button className={side === "sell" ? "on" : undefined} data-s="sell" onClick={() => setSide("sell")}>Sell</button>
        </div>
        <div className="ord-type">
          <button className={type === "market" ? "on" : undefined} onClick={() => setType("market")}>Market</button>
          <button className={type === "limit" ? "on" : undefined} onClick={() => setType("limit")}>Limit</button>
        </div>
        <div id="ordLimitWrap" style={{ display: type === "limit" ? undefined : "none" }}>
          <label className="ord-lab">Limit price</label>
          <div className="ord-in"><input id="ordLimit" placeholder="0.00" inputMode="decimal" /><span className="ord-unit">USD</span></div>
          <div className="ord-hint" id="ordLimHint" />
          <label className="ord-earn" id="ordEarnWrap" style={{ display: "none" }}>
            <input type="checkbox" id="ordEarn" />
            <span><b>Earn fees while you wait</b><small id="ordEarnSub">Buy gradually through a small range and earn the pool fee.</small></span>
          </label>
          <div className="ord-earnbox" id="ordEarnBox" style={{ display: "none" }} />
        </div>
        <label className="ord-lab" id="ordPayLab">{side === "sell" ? "Receive in" : "Pay with"}</label>
        <select className="wm-sel" id="ordPay" style={{ marginBottom: 6, display: "none" }} defaultValue="C:ETH">
          <option value="C:ETH">ETH</option>
        </select>
        <button type="button" className="ap-btn" title="ETH" aria-label="ETH">
          <span className="wl-logo" style={{ background: "#1c2230" }}>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#8fa3ff" d="M12 2 5.5 12.3 12 16l6.5-3.7z" />
              <path fill="#c3cdff" d="M12 17.3 5.5 13.6 12 22l6.5-8.4z" />
            </svg>
          </span>
          <svg className="ap-car" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <div className="wm-hint" style={{ margin: "0 0 12px" }}>
          <span id="ordPayBal">Connect to see balances</span>
          <span id="ordPayPx">1 ETH = $3200.00</span>
        </div>
        <label className="ord-lab" id="ordAmtLab">{side === "sell" ? "Amount to receive" : "Amount to spend"}</label>
        <div className="ord-in"><input id="ordAmt" placeholder="0.0" inputMode="decimal" /><span className="ord-unit">ETH</span></div>
        <div className="ord-pct"><button>25%</button><button>50%</button><button>75%</button><button>Max</button></div>
        <div className="ord-sum"><span>{side === "sell" ? "You sell" : "You get"}</span><span className="ord-sum-v" id="ordCost">{`≈ 0 $${t.tick}  ($0.00)`}</span></div>
        <div id="ordRoute"><div className="rt"><span className="rt-path"><b>ETH</b><i>→</i><b>MSFT</b><i>→</i><b>{t.tick}</b></span><span className="rt-meta">2 hops · fee 0.65%</span></div></div>
        <button className={`ord-submit ${side}`} id="ordBtn" onClick={onConnect}>Connect wallet</button>
        <div className="ord-meta"><span id="ordVenue">{type === "limit" ? "Limit order" : "Market order"}</span><span data-net="">Robinhood Chain</span></div>
      </div>
      <div className="tk-card" id="tkOrdersCard">
        <h3 className="tk-h3">Open orders <span className="oo-n" id="tkOrdN" /></h3>
        <div id="tkOrders"><div className="oo-none">No open orders. Use <b>Limit</b> to buy lower or sell higher.</div></div>
      </div>
      <div className="tk-card" id="tkResCard" style={{ display: "none" }} />
    </aside>
  );
}
