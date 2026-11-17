"use client";
import { useRef } from "react";
import type { UiToken } from "@/lib/live/map";
import { TokenCard } from "./TokenCard";

const ChevR = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 6 6 6-6 6" />
  </svg>
);
const ChevL = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 6-6 6 6 6" />
  </svg>
);

// Port of the v8 row-head + hscroll (render()). Horizontal scroll with the arrows.
export function MarketRow({ title, tokens }: { title: string; tokens: UiToken[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!tokens.length) return null;
  const scroll = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 600), behavior: "smooth" });
  };
  return (
    <div className="sec-card">
      <div className="row-head">
        <h2>
          {title} <span className="rh-count">{tokens.length}</span>
        </h2>
        <div className="row-tools">
          <button className="sc-btn" aria-label="Scroll left" onClick={() => scroll(-1)}>
            {ChevL}
          </button>
          <button className="sc-btn" aria-label="Scroll right" onClick={() => scroll(1)}>
            {ChevR}
          </button>
          <a className="show-more" onClick={() => scroll(1)}>
            Show more {ChevR}
          </a>
        </div>
      </div>
      <div className="hscroll" ref={ref}>
        {tokens.map((t) => (
          <TokenCard key={t.address} t={t} />
        ))}
      </div>
    </div>
  );
}
