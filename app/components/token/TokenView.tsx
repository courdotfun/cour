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

// About-grid item — v8 uses .tk-ab-l/.tk-ab-v (distinct from the .tk-stat grid).
function AbItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="tk-ab-l">{label}</div>
      <div className="tk-ab-v">{value}</div>
    </div>
  );
}

// v8's "$X.XXM" money format for the Volume/Liquidity stats.
const moneyM = (n: number) => "$" + (n / 1e6).toFixed(2) + "M";

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
                {/* Match v8's #tkAva exactly: gradient+letter (or logo), dressed in
                    place by /oink-ava.js (which targets #tkAva), so both render the
                    same 48px Oink avatar. */}
                {/* No id="tkAva": v8 runs dressAvatars once at load (before openToken
                    sets this), so its #tkAva stays an undressed gradient+letter. Omitting
                    the id keeps oink-ava.js from dressing ours, matching v8. */}
                <div
                  className="tk-ava"
                  style={
                    t.logo
                      ? { background: `url(${t.logo}) center/cover` }
                      : { background: `linear-gradient(135deg,hsl(${t.hue} 70% 58%),hsl(${(t.hue + 42) % 360} 72% 46%))` }
                  }
                >
                  {t.logo ? "" : t.tick[0]}
                </div>
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
                <div className="tk-price" id="tkPrice">{price != null ? `$${price < 0.01 ? price.toPrecision(2) : price.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : "—"}</div>
                <div className={`tk-chg ${pos ? "up" : "down"}`} id="tkChg">{pos ? "▲" : "▼"} {Math.abs(t.chg)}%</div>
              </div>
            </div>
            <Chart candles={d.candles} />
          </div>

          <div className="tk-stats" id="tkStats">
            <Stat label="Market cap" value={`$${t.mc}`} />
            <Stat label="FDV" value={t.fdv === "—" ? "—" : `$${t.fdv}`} />
            <Stat label="24h Volume" value={moneyM(d.raw.volumeUsd)} />
            <Stat label="Holders" value={d.holderCount.toLocaleString()} />
            <Stat label="Liquidity" value={moneyM(d.liquidityUsd)} />
            <Stat label="Supply" value="1B" />
          </div>

          <TradesHolders trades={d.trades} holders={d.holders} stockDecimals={t.stockDecimals} />

          <div className="tk-card">
            <h3 className="tk-h3">About</h3>
            <p className="tk-desc">{`${t.name} ($${t.tick}) is a tokenized asset trading 24/7 on Robinhood Chain — no broker, no market hours, settled fully on-chain.`}</p>
            <div className="tk-abgrid" id="tkAbout">
              <AbItem label="Creator" value={t.addr} />
              <AbItem label="Contract" value={t.addr} />
              <AbItem label="Total supply" value="1,000,000,000" />
              <AbItem label="Pair" value={`ETH / ${t.tick}`} />
              <AbItem label="Launched" value={`${t.age} ago`} />
              <AbItem label="Creator fee" value={`${(t.creatorFee > 0 ? t.creatorFee : 1).toFixed(2)}%`} />
            </div>
            {/* v8's tokNote() appends this inside the About card. */}
            <div className="lg-note"><b>Community token.</b> Launched by its creator and not audited by COUR. The creator fee is set at launch and cannot be changed. Never invest more than you can lose.</div>
          </div>

          <Updates token={t.address} creator={d.raw.creator} />
        </div>

        <OrderPanel t={t} />
      </div>
    </section>
  );
}
