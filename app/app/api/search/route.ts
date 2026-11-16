import { ilike, or, eq } from "drizzle-orm";
import { getDb, dbConfigured, schema } from "@/db/client";
import { indexerJson } from "@/lib/server/indexer";
import { deployment } from "@/lib/chain/deployment";
import { normAddr } from "@/lib/util/address";

export const dynamic = "force-dynamic";

// The indexer has no /search; compose results from indexer tokens + known stocks
// + app profiles. Known stocks come from the deployment (only NVDA is live now).
const STOCKS = [{ symbol: "NVDA", address: deployment.nvda }];

type IxToken = { address: string; name?: string | null; symbol?: string | null; graduated: boolean };

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 1) return Response.json({ tokens: [], stocks: [], users: [] });

  // tokens (from indexer, filtered in-app)
  const data = await indexerJson<{ tokens: IxToken[] }>("/tokens?filter=trending&limit=500");
  const tokens = (data?.tokens ?? [])
    .filter(
      (t) =>
        t.address.toLowerCase().includes(q) ||
        (t.name ?? "").toLowerCase().includes(q) ||
        (t.symbol ?? "").toLowerCase().includes(q),
    )
    .slice(0, 10)
    .map((t) => ({ address: t.address, name: t.name, symbol: t.symbol, graduated: t.graduated }));

  // stocks
  const stocks = STOCKS.filter(
    (s) => s.symbol.toLowerCase().includes(q) || s.address.toLowerCase().includes(q),
  );

  // users (from app profiles, if DB configured)
  let users: Array<{ address: string; name: string | null; avatarCid: string | null }> = [];
  if (dbConfigured()) {
    const db = getDb();
    const addr = normAddr(q);
    const rows = await db
      .select({ address: schema.profiles.address, name: schema.profiles.name, avatarCid: schema.profiles.avatarCid })
      .from(schema.profiles)
      .where(addr ? eq(schema.profiles.address, addr) : or(ilike(schema.profiles.name, `%${q}%`)))
      .limit(10);
    users = rows;
  }

  return Response.json({ tokens, stocks, users });
}
