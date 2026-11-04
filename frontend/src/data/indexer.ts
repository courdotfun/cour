// REST client for the Ponder indexer (indexer/src/api). REST is preferred over
// GraphQL. Every call returns a discriminated result so callers can render
// honest loading / empty / error states instead of fabricated data.
import type {
  CandleRow,
  GlobalStats,
  HolderRow,
  Portfolio,
  TokenFilter,
  TokenRow,
  TradeRow,
  UserStats,
  Hex,
} from "./types";

const BASE = (import.meta.env.VITE_INDEXER_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string; status?: number };
export type Result<T> = Ok<T> | Err;

export function indexerConfigured(): boolean {
  return BASE.length > 0;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<Result<T>> {
  if (!BASE) {
    return { ok: false, error: "Indexer not configured (VITE_INDEXER_URL unset)" };
  }
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, error: `Indexer ${res.status}`, status: res.status };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network error" };
  }
}

export const indexer = {
  stats: (signal?: AbortSignal) => getJson<GlobalStats>("/stats", signal),

  tokens: (filter: TokenFilter = "new", limit = 50, offset = 0, signal?: AbortSignal) =>
    getJson<{ filter: string; tokens: TokenRow[] }>(
      `/tokens?filter=${filter}&limit=${limit}&offset=${offset}`,
      signal,
    ),

  token: (addr: string, signal?: AbortSignal) =>
    getJson<TokenRow>(`/token/${addr.toLowerCase()}`, signal),

  candles: (token: string, interval = "1m", limit = 500, signal?: AbortSignal) =>
    getJson<{ token: Hex; interval: string; candles: CandleRow[] }>(
      `/candles?token=${token.toLowerCase()}&interval=${interval}&limit=${limit}`,
      signal,
    ),

  trades: (token: string | null, limit = 50, offset = 0, signal?: AbortSignal) =>
    getJson<{ trades: TradeRow[] }>(
      `/trades?${token ? `token=${token.toLowerCase()}&` : ""}limit=${limit}&offset=${offset}`,
      signal,
    ),

  holders: (token: string, limit = 100, signal?: AbortSignal) =>
    getJson<{ token: Hex; count: number; holders: HolderRow[] }>(
      `/holders?token=${token.toLowerCase()}&limit=${limit}`,
      signal,
    ),

  portfolio: (addr: string, signal?: AbortSignal) =>
    getJson<Portfolio>(`/portfolio/${addr.toLowerCase()}`, signal),

  topUsers: (limit = 50, signal?: AbortSignal) =>
    getJson<{ users: UserStats[] }>(`/top-users?limit=${limit}`, signal),
};
