import Link from "next/link";
import { indexerJson } from "@/lib/server/indexer";
import { mapToken } from "@/lib/live/map";
import type { TokenRow } from "@/lib/data/types";
import { Ava } from "@/components/market/Ava";
import { DEAD_ADDRESS } from "@/lib/chain/deployment";

export const revalidate = 10;
export const metadata = { title: "Liquidity pools — COUR" };

// §4: COUR pools have LP fee 0 and the LP is burned — this page is INFORMATIONAL.
// No deposit/zap. Lists graduated tokens' on-chain pools (real data).
export default async function PoolsPage() {
  const data = await indexerJson<{ tokens: TokenRow[] }>("/tokens?filter=graduated&limit=100");
  const pools = (data?.tokens ?? []).map((t) => mapToken(t));
  return (
    <section className="view active" id="pools">
      <div className="pl-head">
        <div>
          <h1>Liquidity pools</h1>
          <div className="pl-sub">
            When a COUR token graduates, its liquidity moves to a real on-chain pool and the
            LP position is burned forever. These pools are permissionless and cannot be paused.
          </div>
        </div>
        <div className="pl-hours" id="plHours"><span className="dot" /><b id="plHoursTxt">ON-CHAIN</b></div>
      </div>
      <div className="pl-note">
        <b>!</b>
        <div>
          COUR pools charge <b>no LP fee</b> and the liquidity is <b>burned</b> — there is nothing
          to deposit or withdraw here. Trading happens permissionlessly on the graduated pool.
          <span style={{ opacity: 0.7 }}> Deposit / zap — Coming soon.</span>
        </div>
      </div>
      <div className="pl-sechead">All pools <span id="plCount">{pools.length}</span></div>
      <div className="pl-grid" id="plGrid">
        {pools.length === 0 ? (
          <p style={{ color: "var(--muted)", padding: "24px 0" }}>No graduated pools yet.</p>
        ) : (
          pools.map((t) => (
            <Link key={t.address} className="pl-card" href={`/token/${t.address}`}>
              <div className="pl-card-top">
                <Ava t={t} size={40} />
                <div>
                  <div className="pl-card-name">{t.name} <span className="pl-pair">/ {t.pair}</span></div>
                  <div className="pl-card-sub">${t.tick} · ${t.mc} mcap</div>
                </div>
              </div>
              <div className="pl-card-foot">
                <span className="pl-burned">LP burned → {DEAD_ADDRESS.slice(0, 6)}…{DEAD_ADDRESS.slice(-4)}</span>
                <span className="pl-soon">Deposit — soon</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
