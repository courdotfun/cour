// Thin HTTP analytics API over the Phase-1 indexer. All math is in aggregate.ts
// (unit-tested). No contract code.
//   GET /analytics/volume?token=0x..&interval=3600
//   GET /analytics/traders?token=0x..
//   GET /analytics/funnel
//   GET /analytics/fees
import { createServer } from "node:http";
import { IndexerClient } from "../shared/indexer-client.ts";
import { volumeByInterval, traderGrowth, launchFunnel, feeDistribution } from "./aggregate.ts";

const PORT = Number(process.env.PORT || 4901);
const INDEXER_URL = process.env.INDEXER_URL || "http://localhost:42069";
const client = new IndexerClient({ baseUrl: INDEXER_URL });

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const p = url.pathname;
    if (p === "/analytics/volume") {
      const token = url.searchParams.get("token");
      const interval = Number(url.searchParams.get("interval") || 3600);
      const { trades } = await client.trades(token, 500);
      return res.end(JSON.stringify({ buckets: volumeByInterval(trades, interval) }));
    }
    if (p === "/analytics/traders") {
      const { trades } = await client.trades(url.searchParams.get("token"), 500);
      return res.end(JSON.stringify({ growth: traderGrowth(trades) }));
    }
    if (p === "/analytics/funnel") {
      const { tokens } = await client.tokens("new", 500);
      return res.end(JSON.stringify(launchFunnel(tokens)));
    }
    if (p === "/analytics/fees") {
      const { tokens } = await client.tokens("new", 500);
      const { trades } = await client.trades(null, 500);
      const modeOf = (addr: string) => tokens.find((t) => t.address.toLowerCase() === addr.toLowerCase())?.mode ?? 0;
      const dist = feeDistribution(trades, modeOf);
      // bigint → string for JSON
      return res.end(JSON.stringify(Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, v.toString()]))));
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "unknown endpoint" }));
  } catch (e: any) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e?.message ?? "upstream error" }));
  }
});

if (process.argv[1]?.endsWith("server.ts")) {
  server.listen(PORT, () => console.log(`[analytics] http://localhost:${PORT} → indexer ${INDEXER_URL}`));
}

export { server };
