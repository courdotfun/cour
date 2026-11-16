import "server-only";
import { indexerJson } from "./indexer";
import { mapToken, type UiToken } from "@/lib/live/map";
import type { TokenRow, UserStats } from "@/lib/data/types";

type TokensResp = { tokens: TokenRow[] };
type TopResp = { users: UserStats[] };
type StatsResp = { totalTokens: number };

async function rowFor(filter: string, limit = 12): Promise<UiToken[]> {
  const data = await indexerJson<TokensResp>(`/tokens?filter=${filter}&limit=${limit}`);
  return (data?.tokens ?? []).map((t) => mapToken(t));
}

export type MarketData = {
  trending: UiToken[];
  fresh: UiToken[];
  graduated: UiToken[];
  topUsers: UserStats[];
  totalTokens: number;
};

export async function loadMarket(): Promise<MarketData> {
  const [trending, fresh, graduated, top, stats] = await Promise.all([
    rowFor("trending"),
    rowFor("new"),
    rowFor("graduated"),
    indexerJson<TopResp>("/top-users?limit=8"),
    indexerJson<StatsResp>("/stats"),
  ]);
  return {
    trending,
    fresh,
    graduated,
    topUsers: top?.users ?? [],
    totalTokens: stats?.totalTokens ?? trending.length + fresh.length + graduated.length,
  };
}
