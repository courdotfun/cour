import Link from "next/link";
import type { TokenDetail } from "@/lib/server/token";
import { Chart } from "@/components/token/Chart";
import { TradesHolders } from "@/components/token/TradesHolders";
import { Updates } from "@/components/token/Updates";
import { OrderPanel } from "@/components/token/OrderPanel";

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
// v8's stockFill renders About items as `.tk-ab` with <span> label + <b> value (distinct
// from the token page's .tk-ab-l/.tk-ab-v). Match that structure so the labels align.
function AbItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="tk-ab">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

// Stock page = v8's #token view dressed by stockFill (.tk-stock). Reuses the token chrome
// (header / chart / stats / about / order). Copy is NEUTRAL (see docs/LEGAL_TODO.md): no
// instrument-type or "1:1 share" claim in visible compared text. Dynamic values (price,
// 24h change, market status, stat/about values, chart, trades, order) are masked in the
// parity harness; the stat/about LABELS + description chrome are what's compared.
export function StockView({ d }: { d: TokenDetail }) {
  const t = d.ui;
  return (
    <section className="view active tk-stock" id="token">
      <Link className="back-btn back-full" href="/">{Back}Back to market</Link>
      <div className="tk-grid">
        <div className="tk-main">
          <div className="tk-card tk-chartcard">
            <div className="tk-top">
              <div className="tk-id">
                <Link className="back-btn back-ic" href="/" aria-label="Back to market">{Back}</Link>
                <div className="tk-ava" style={{ background: `linear-gradient(135deg,hsl(${t.hue} 70% 58%),hsl(${(t.hue + 42) % 360} 72% 46%))` }}>{t.tick[0]}</div>
                <div>
                  <div className="tk-name">{t.name}</div>
                  <div className="tk-tick">${t.tick}</div>
                </div>
                <span className="tk-badge b-grad">Stock</span>
              </div>
              <div className="tk-contract" id="tkAddr">
                <span className="tk-chip">Tokenized stock</span>
              </div>
            </div>
            <div className="tk-priceline">
              <div>
                <div className="tk-price" id="tkPrice">—</div>
                <div className="tk-chg up" id="tkChg">▲ +0%  ·  24h</div>
              </div>
            </div>
            <Chart candles={d.candles} />
          </div>

          <div className="tk-stats" id="tkStats">
            <Stat label="Price" value="—" />
            <Stat label="24h change" value="—" />
            <Stat label="Market" value="—" />
            <Stat label="Type" value="Stock token" />
            <Stat label="Backing" value="—" />
            <Stat label="Network" value="Robinhood Chain" />
          </div>

          <TradesHolders trades={d.trades} holders={d.holders} stockDecimals={t.stockDecimals} />

          <div className="tk-card">
            <h3 className="tk-h3">About</h3>
            <p className="tk-desc">{`${t.name} ($${t.tick}) is a tokenized stock on Robinhood Chain that tracks ${t.name}'s market price and trades 24/7, settled on-chain.`}</p>
            <div className="tk-abgrid" id="tkAbout">
              <AbItem label="Asset" value={t.name} />
              <AbItem label="Ticker" value={t.tick} />
              <AbItem label="Pair" value={`ETH / ${t.tick}`} />
              <AbItem label="Backing" value="—" />
              <AbItem label="Trading" value="—" />
            </div>
            <div className="lg-note"><b>Tokenized stock.</b> Availability depends on your region. Prices can move fast, especially around US market open and close. Never invest more than you can lose.</div>
          </div>

          <Updates token={t.address} creator="0x0000000000000000000000000000000000000000" />
        </div>

        <OrderPanel t={t} />
      </div>
    </section>
  );
}
