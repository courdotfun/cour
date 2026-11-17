import "server-only";
import { indexerJson } from "./indexer";
import { mapToken, mapCandles, type UiToken } from "@/lib/live/map";
import type { TokenRow, TradeRow, HolderRow, CandleRow } from "@/lib/data/types";

export type TokenDetail = {
  ui: UiToken;
  raw: TokenRow;
  holderCount: number;
  liquidityUsd: number; // v8 token view's "Liquidity" stat (prod wiring TBD)
  candles: { o: number; h: number; l: number; c: number; v: number }[];
  trades: TradeRow[];
  holders: HolderRow[];
  description: string | null;
  links: Record<string, string> | null;
};

async function ipfsMeta(uri: string | null): Promise<{ description: string | null; links: Record<string, string> | null }> {
  if (!uri) return { description: null, links: null };
  const url = uri.startsWith("ipfs://")
    ? `https://gateway.pinata.cloud/ipfs/${uri.slice(7)}`
    : uri.startsWith("http")
      ? uri
      : null;
  if (!url) return { description: null, links: null };
  try {
    const ctrl = AbortSignal.timeout(4000);
    const res = await fetch(url, { signal: ctrl, next: { revalidate: 300 } });
    if (!res.ok) return { description: null, links: null };
    const j = (await res.json()) as { description?: string; links?: Record<string, string> };
    return { description: j.description ?? null, links: j.links ?? null };
  } catch {
    return { description: null, links: null };
  }
}

const FIXTURE = process.env.NEXT_PUBLIC_VISUAL_FIXTURE === "1";

export async function loadToken(address: string): Promise<TokenDetail | null> {
  if (FIXTURE) {
    // Visual-parity mode: serve the same AUR token v8's openToken('AUR') shows, for
    // any requested address. NEVER enabled in production.
    const { FIXTURE_TOKEN_DETAIL } = await import("@/lib/fixtureToken");
    return FIXTURE_TOKEN_DETAIL;
  }
  const addr = address.toLowerCase();
  const tok = await indexerJson<TokenRow & { holderCount?: number }>(`/token/${addr}`);
  if (!tok || !(tok as any).address) return null;

  const [candlesResp, tradesResp, holdersResp] = await Promise.all([
    indexerJson<{ candles: CandleRow[] }>(`/candles?token=${addr}&interval=1h&limit=168`),
    indexerJson<{ trades: TradeRow[] }>(`/trades?token=${addr}&limit=50`),
    indexerJson<{ holders: HolderRow[]; count: number }>(`/holders?token=${addr}&limit=50`),
  ]);
  const candleRows = candlesResp?.candles ?? [];
  const meta = await ipfsMeta(tok.metadataURI);

  return {
    ui: mapToken(tok, { candles: candleRows }),
    raw: tok,
    holderCount: (tok as any).holderCount ?? holdersResp?.count ?? (holdersResp?.holders?.length ?? 0),
    liquidityUsd: 0, // TODO: derive from pool/curve reserves
    candles: mapCandles(candleRows),
    trades: tradesResp?.trades ?? [],
    holders: holdersResp?.holders ?? [],
    description: meta.description,
    links: meta.links,
  };
}
