// Thin REST client for the Phase-1 Ponder indexer. `fetchImpl` is injectable so
// unit tests can run fully offline with a stub.
import type { TokenRow, TradeRow, CandleRow, GlobalStats } from "./types.ts";

export type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export interface IndexerClientOpts {
  baseUrl: string;
  fetchImpl?: FetchLike;
}

export class IndexerClient {
  private base: string;
  private f: FetchLike;
  constructor(opts: IndexerClientOpts) {
    this.base = opts.baseUrl.replace(/\/$/, "");
    this.f = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }
  private async get<T>(path: string): Promise<T> {
    const res = await this.f(`${this.base}${path}`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`indexer ${res.status} for ${path}`);
    return (await res.json()) as T;
  }
  stats() {
    return this.get<GlobalStats>("/stats");
  }
  tokens(filter = "new", limit = 100, offset = 0) {
    return this.get<{ filter: string; tokens: TokenRow[] }>(`/tokens?filter=${filter}&limit=${limit}&offset=${offset}`);
  }
  token(addr: string) {
    return this.get<TokenRow>(`/token/${addr.toLowerCase()}`);
  }
  trades(token: string | null, limit = 100, offset = 0) {
    return this.get<{ trades: TradeRow[] }>(`/trades?${token ? `token=${token.toLowerCase()}&` : ""}limit=${limit}&offset=${offset}`);
  }
  candles(token: string, interval = "1h", limit = 200) {
    return this.get<{ token: string; interval: string; candles: CandleRow[] }>(
      `/candles?token=${token.toLowerCase()}&interval=${interval}&limit=${limit}`,
    );
  }
}
