// Thin HTTP adapter exposing COUR data in screener schemas. Reads from the
// Phase-1 indexer; all shaping is in map.ts (unit-tested). No contract code.
//   GET /screener/pairs                     → DexScreener pairs
//   GET /screener/events?token=0x..         → DexScreener swap events
//   GET /screener/geckoterminal/pools       → GeckoTerminal pools
//   GET /screener/geckoterminal/ohlcv?token=0x..&interval=1h
import { createServer } from "node:http";
import { IndexerClient } from "../shared/indexer-client.ts";
import type { Hex } from "../shared/types.ts";
import { toDexScreenerPair, toDexScreenerEvents, toGeckoPool, toGeckoOhlcv } from "./map.ts";

const PORT = Number(process.env.PORT || 4900);
const INDEXER_URL = process.env.INDEXER_URL || "http://localhost:42069";
const client = new IndexerClient({ baseUrl: INDEXER_URL });

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const p = url.pathname;
    if (p === "/screener/pairs") {
      const { tokens } = await client.tokens("trending", 200);
      return res.end(JSON.stringify({ pairs: tokens.map(toDexScreenerPair) }));
    }
    if (p === "/screener/events") {
      const token = url.searchParams.get("token");
      const { trades } = await client.trades(token, 200);
      const { tokens } = await client.tokens("new", 500);
      const pairIdOf = (addr: string) => {
        const t = tokens.find((x) => x.address.toLowerCase() === addr.toLowerCase());
        return t ? (t.graduated && t.poolId ? t.poolId : t.curve).toLowerCase() : addr.toLowerCase();
      };
      return res.end(JSON.stringify({ events: toDexScreenerEvents(trades, pairIdOf) }));
    }
    if (p === "/screener/geckoterminal/pools") {
      const { tokens } = await client.tokens("trending", 200);
      return res.end(JSON.stringify({ data: tokens.map(toGeckoPool) }));
    }
    if (p === "/screener/geckoterminal/ohlcv") {
      const token = url.searchParams.get("token");
      if (!token) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "token required" }));
      }
      const { candles } = await client.candles(token as Hex, url.searchParams.get("interval") || "1h", 500);
      return res.end(JSON.stringify({ ohlcv_list: toGeckoOhlcv(candles) }));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "unknown endpoint" }));
  } catch (e: any) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e?.message ?? "upstream error" }));
  }
});

if (process.argv[1]?.endsWith("server.ts")) {
  server.listen(PORT, () => console.log(`[screener] http://localhost:${PORT} → indexer ${INDEXER_URL}`));
}

export { server };
