"use client";
import { useState } from "react";
import Link from "next/link";

const ChevL = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
);
const ChevR = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
);

// Port of the v8 promo carousel. §4: the middle promo no longer advertises "earn
// trading fees / add liquidity" (COUR pools have LP fee 0 and burned LP) — it now
// points to the informational Pools page.
export function Promos() {
  const [i, setI] = useState(0);
  const n = 3;
  return (
    <div className="promo-wrap" id="promoWrap">
      <div className="promos" id="promos" style={{ transform: `translateX(-${i * 100}%)` }}>
        <div className="promo promo-green">
          <div className="promo-body">
            <h2>Launch on top of stock tokens.</h2>
            <p className="promo-sub">Pick a stock, deploy in seconds. Liquidity handled for you.</p>
            <Link className="promo-btn" href="/create">Deploy now</Link>
          </div>
          <div className="promo-art">
            <div className="orbit" id="orbit">
              <div className="orbit-path" />
              <div className="orbit-core" aria-label="COUR" />
            </div>
          </div>
        </div>
        <div className="promo promo-lp">
          <div className="promo-body">
            <div className="promo-tag">POOLS</div>
            <h2>Graduated tokens, real liquidity.</h2>
            <p className="promo-sub">When a token graduates, its liquidity moves on-chain and the LP is burned forever.</p>
            <Link className="promo-btn" href="/pools">View pools</Link>
          </div>
          <div className="promo-drops">
            <div className="lp-feed" id="lpFeed" />
            <div className="lp-ripple" id="lpRipple" />
            <div className="lp-pool" id="lpPool">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3s6 6.4 6 10.4a6 6 0 0 1-12 0C6 9.4 12 3 12 3Z" /></svg>
            </div>
          </div>
        </div>
        <div className="promo promo-crew">
          <div className="promo-body">
            <div className="promo-tag">COMING SOON · OINK</div>
            <h2>Oink Collection.</h2>
            <p className="promo-sub">Collect Oink skins, show off your rarity, and unlock more as you trade.</p>
            <button className="promo-btn" style={{ opacity: 0.55, cursor: "default" }}>Coming soon</button>
          </div>
          <div className="promo-art" id="oxCrew" />
        </div>
      </div>
      <button className="promo-nav prev" aria-label="Previous" onClick={() => setI((v) => (v - 1 + n) % n)}>{ChevL}</button>
      <button className="promo-nav next" aria-label="Next" onClick={() => setI((v) => (v + 1) % n)}>{ChevR}</button>
      <div className="promo-dots" id="promoDots">
        {Array.from({ length: n }).map((_, k) => (
          <button key={k} className={`promo-dot${k === i ? " on" : ""}`} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} />
        ))}
      </div>
    </div>
  );
}
