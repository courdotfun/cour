import Link from "next/link";
import type { UiToken } from "@/lib/live/map";
import { Ava } from "./Ava";
import { Spark } from "./Spark";

const badgeClass: Record<string, string> = {
  Graduated: "b-grad",
  New: "b-new",
  Trending: "b-trend",
};

// Port of the v8 card(t) — identical markup/classes. Navigates to the token page
// instead of the demo openToken().
export function TokenCard({ t }: { t: UiToken }) {
  const pos = t.chg >= 0;
  return (
    <Link
      href={`/token/${t.address}`}
      className="card"
      data-tick={t.tick}
      data-name={`${t.name} ${t.tick}`.toLowerCase()}
    >
      <div className="card-top">
        <Ava t={t} />
        <div>
          <div className="name">{t.name}</div>
          <div className="tick">${t.tick}</div>
        </div>
        <span className={`badge ${badgeClass[t.badge]}`}>{t.badge}</span>
      </div>
      <div className="mc-row">
        <div>
          <div className="mc-label">Market cap</div>
          <div className="mc">${t.mc}</div>
        </div>
        <div className={`chg ${pos ? "up" : "down"}`}>
          {pos ? "▲" : "▼"} {Math.abs(t.chg)}%
        </div>
      </div>
      <Spark data={t.h} pos={pos} />
      <div className="card-foot">
        <span className="addr">{t.addr}</span>
        <span>{t.age} ago</span>
      </div>
    </Link>
  );
}
