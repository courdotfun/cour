import { Promos } from "./Promos";
import { MarketRow } from "./MarketRow";
import { type MarketData, FIXTURE } from "@/lib/server/market";
import { shortAddr } from "@/lib/ui/format";
import { LegalLinks } from "@/components/shell/RiskGate";

function TopUsers({ users }: { users: MarketData["topUsers"] }) {
  if (!users.length) return null;
  return (
    <div id="topUsers">
      <div className="row-head">
        <h2>Top traders <span className="rh-count">{users.length}</span></h2>
      </div>
      <div className="tu-list">
        {users.map((u, i) => (
          <a key={u.address} className="tu-row" href={`/u/${u.address}`}>
            <span className="tu-rank">{i + 1}</span>
            <span className="tu-addr">{shortAddr(u.address)}</span>
            <span className="tu-vol">${Math.round(u.volumeUsd).toLocaleString()}</span>
            <span className="tu-trades">{u.tradeCount} trades</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function Market({ data }: { data: MarketData }) {
  const empty = !data.trending.length && !data.fresh.length && !data.graduated.length;
  return (
    <section className="view active" id="home">
      <Promos />
      <div className="head-row">
        <div>
          <h1>
            Market <span className="count" id="tokCount">{FIXTURE ? `${data.totalTokens} tokens · 8 stocks` : `${data.totalTokens} tokens`}</span>
          </h1>
          <p>
            Tokenized stocks and community tokens on <span data-net>Robinhood Chain</span>. Buy with ETH or a stock token.
          </p>
        </div>
      </div>
      <div id="sections">
        {empty ? (
          <p style={{ color: "var(--muted)", padding: "30px 0" }}>
            No tokens yet. Launches are invite-only during beta.
          </p>
        ) : (
          <>
            <MarketRow title="Trending" tokens={data.trending} />
            <MarketRow title="New launch" tokens={data.fresh} />
            <MarketRow title="Graduated" tokens={data.graduated} />
          </>
        )}
      </div>
      <TopUsers users={data.topUsers} />
      <LegalLinks />
    </section>
  );
}
