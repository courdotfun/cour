"use client";
import { useRef } from "react";
import { StockCard } from "./StockCard";

const ChevR = (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>);
const ChevL = (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>);

// Port of v8 stockSection() (+ stkNote): the "Stocks" row, first on Home, in a sec-card.
export function StockRow({ syms }: { syms: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!syms.length) return null;
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * Math.min(ref.current.clientWidth * 0.8, 600), behavior: "smooth" });
  return (
    <div className="sec-card">
      <div className="row-head">
        <h2>Stocks <span className="rh-count">{syms.length}</span></h2>
        <div className="row-tools">
          <button className="sc-btn" aria-label="Scroll left" onClick={() => scroll(-1)}>{ChevL}</button>
          <button className="sc-btn" aria-label="Scroll right" onClick={() => scroll(1)}>{ChevR}</button>
        </div>
      </div>
      <div className="lg-note lg-stk">
        <b>Stock tokens are not shares.</b> They are tokenized debt securities issued by a third party: price exposure only, no ownership or voting rights. Not available in every country.
      </div>
      <div className="hscroll" id="stkRow" ref={ref}>
        {syms.map((s) => <StockCard key={s} sym={s} />)}
      </div>
    </div>
  );
}
