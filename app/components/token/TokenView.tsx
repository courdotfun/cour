import Link from "next/link";
import type { TokenDetail } from "@/lib/server/token";
import { Ava } from "@/components/market/Ava";
import { Chart } from "./Chart";
import { TradesHolders } from "./TradesHolders";
import { Updates } from "./Updates";
import { OrderPanel } from "./OrderPanel";
import { feeModeLabel } from "@/lib/data/types";
import { explorerAddress, explorerToken, DEAD_ADDRESS } from "@/lib/chain/deployment";

const Back = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
);

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="tk-stat">
      <div className="tk-stat-l">{label}</div>
      <div className="tk-stat-v">{value}</div>
    </div>
  );
}

export function TokenView({ d }: { d: TokenDetail }) {
  const t = d.ui;
  const pos = t.chg >= 0;
  const progress = Math.min(100, d.raw.progressBps / 100);
  const price = t.lastPriceUsd;
  return (
    <section className="view active" id="token">
      <Link className="back-btn back-full" href="/">{Back}Back to market</Link>
      <div className="tk-grid">
        <div className="tk-main">
          <div className="tk-card tk-chartcard">
            <div className="tk-top">
              <div className="tk-id">
                <Link className="back-btn back-ic" href="/" aria-label="Back to market">{Back}</Link>
                <div className="tk-ava"><Ava t={t} size={44} /></div>
                <div>
                  <div className="tk-name">{t.name}</div>
                  <div className="tk-tick">${t.tick}</div>
                </div>
                <span className={`tk-badge ${t.badge === "Graduated" ? "b-grad" : t.badge === "Trending" ? "b-trend" : "b-new"}`}>{t.badge}</span>
              </div>
              <div className="tk-contract">
                <a className="tk-chip" href={explorerToken(t.address)} target="_blank" rel="noreferrer">{t.addr}</a>
                <a className="tk-chip" href={explorerAddress(t.address)} target="_blank" rel="noreferrer">Explorer ↗</a>
              </div>
            </div>
            <div className="tk-priceline">
              <div>
                <div className="tk-price">{price != null ? `$${price < 0.01 ? price.toPrecision(2) : price.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : "—"}</div>
                <div className={`tk-chg ${pos ? "up" : "down"}`}>{pos ? "▲" : "▼"} {Math.abs(t.chg)}%</div>
              </div>
            </div>
            <Chart candles={d.candles} />
          </div>

          <div className="tk-stats" id="tkStats">
            <Stat label="Market cap" value={`$${t.mc}`} />
            <Stat label="Progress" value={d.raw.graduated ? "Graduated" : `${progress.toFixed(1)}%`} />
            <Stat label="Creator fee" value={`${t.creatorFee}% · ${feeModeLabel(d.raw.mode)}`} />
            <Stat label="Holders" value={d.holderCount.toLocaleString()} />
            <Stat label="Pair" value={t.pair} />
            <Stat label="Age" value={`${t.age} ago`} />
          </div>

          <TradesHolders trades={d.trades} holders={d.holders} stockDecimals={t.stockDecimals} />

          <div className="tk-card">
            <h3 className="tk-h3">About</h3>
            <p className="tk-desc">{d.description || "No description provided."}</p>
            <div className="tk-abgrid">
              <Stat label="Contract" value={t.addr} />
              <Stat label="Creator" value={<a href={`/u/${d.raw.creator}`}>{d.raw.creator.slice(0, 6)}…{d.raw.creator.slice(-4)}</a>} />
              {d.raw.graduated && (
                <Stat label="Liquidity" value={<span>Graduated · LP burned to {DEAD_ADDRESS.slice(0, 6)}…{DEAD_ADDRESS.slice(-4)}</span>} />
              )}
            </div>
          </div>

          <Updates token={t.address} creator={d.raw.creator} />
        </div>

        <OrderPanel t={t} />
      </div>
    </section>
  );
}
