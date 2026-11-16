"use client";
import { useState } from "react";

type Candle = { o: number; h: number; l: number; c: number; v: number };

// Real-data candlestick (SVG). A faithful stand-in for the v8 canvas chart: same
// container classes + candle/line toggle; draws real OHLC from the indexer.
export function Chart({ candles }: { candles: Candle[] }) {
  const [mode, setMode] = useState<"candle" | "line">("candle");
  const W = 760;
  const H = 320;
  const pad = 8;
  if (!candles.length) {
    return (
      <div className="tk-chartwrap" id="tkChartWrap">
        <div className="tk-chart" id="tkChart" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
          No trades yet — chart appears after the first trade.
        </div>
      </div>
    );
  }
  const hi = Math.max(...candles.map((c) => c.h));
  const lo = Math.min(...candles.map((c) => c.l));
  const rng = hi - lo || 1;
  const n = candles.length;
  const cw = (W - pad * 2) / n;
  const y = (v: number) => pad + (1 - (v - lo) / rng) * (H - pad * 2);
  const x = (i: number) => pad + i * cw + cw / 2;

  return (
    <div className="tk-chartcard-inner">
      <div className="tk-ctools">
        <div className="tk-ctype">
          <button className={mode === "candle" ? "on" : ""} onClick={() => setMode("candle")} title="Candlestick">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 4v3M8 16v4M16 3v4M16 15v6" /><rect x="6" y="7" width="4" height="9" rx="1" /><rect x="14" y="7" width="4" height="8" rx="1" /></svg>
          </button>
          <button className={mode === "line" ? "on" : ""} onClick={() => setMode("line")} title="Line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15l5-6 4 4 8-9" /></svg>
          </button>
        </div>
      </div>
      <div className="tk-chartwrap" id="tkChartWrap">
        <svg className="tk-chart" id="tkChart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          {mode === "line" ? (
            <polyline
              fill="none"
              stroke="#4ade80"
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
              points={candles.map((c, i) => `${x(i)},${y(c.c)}`).join(" ")}
            />
          ) : (
            candles.map((c, i) => {
              const up = c.c >= c.o;
              const col = up ? "#4ade80" : "#f87171";
              const bodyTop = y(Math.max(c.o, c.c));
              const bodyBot = y(Math.min(c.o, c.c));
              return (
                <g key={i}>
                  <line x1={x(i)} y1={y(c.h)} x2={x(i)} y2={y(c.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <rect x={x(i) - Math.max(1, cw * 0.3)} y={bodyTop} width={Math.max(2, cw * 0.6)} height={Math.max(1, bodyBot - bodyTop)} fill={col} />
                </g>
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
}
