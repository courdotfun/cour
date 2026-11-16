import { indexerJson } from "@/lib/server/indexer";

// NOTE: scaffold shell. This is replaced by the ported v8 Market/Home view in the
// UI-port step. It renders REAL tokens from the indexer (no demo data) so the
// end-to-end data path is verifiable now.
type TokensResp = {
  tokens: Array<{
    address: string;
    name?: string | null;
    symbol?: string | null;
    lastPriceUsd?: number | null;
    graduated: boolean;
    progressBps: number;
  }>;
};

export const revalidate = 10;

export default async function Home() {
  const data = await indexerJson<TokensResp>("/tokens?filter=trending&limit=24");
  const tokens = data?.tokens ?? [];
  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: 24 }}>
      <h1>COUR</h1>
      <p style={{ color: "#93a4b7" }}>
        App scaffold live. Market view (ported from v8) renders here.
      </p>
      {tokens.length === 0 ? (
        <p style={{ color: "#93a4b7" }}>No tokens yet.</p>
      ) : (
        <ul>
          {tokens.map((t) => (
            <li key={t.address}>
              {t.name ?? "?"} ({t.symbol ?? "?"}) —{" "}
              {t.lastPriceUsd != null ? `$${t.lastPriceUsd}` : "—"}{" "}
              {t.graduated ? "· graduated" : `· ${(t.progressBps / 100).toFixed(1)}%`}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
