import { db } from "ponder:api";
import schema from "ponder:schema";
import { graphql } from "ponder";
import { and, desc, asc, eq, gt, sql } from "ponder";
import { Hono } from "hono";

const app = new Hono();

// Keep Ponder's GraphQL (schema-driven) at /graphql and /.
app.use("/graphql", graphql({ db, schema }));
app.use("/", graphql({ db, schema }));

// --- helpers --------------------------------------------------------------
/** JSON response that safely serializes bigint values as strings. */
function j(c: any, data: unknown, status = 200) {
  const body = JSON.stringify(data, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  return c.body(body, status, { "Content-Type": "application/json" });
}

function clampLimit(v: string | undefined, def: number, max = 500): number {
  const n = Number(v ?? def);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

// --- /stats ---------------------------------------------------------------
app.get("/stats", async (c) => {
  const g = await db
    .select()
    .from(schema.globalStat)
    .where(eq(schema.globalStat.id, "global"))
    .limit(1);
  const base =
    g[0] ??
    ({
      totalTokens: 0,
      totalGraduated: 0,
      totalTrades: 0,
      totalVolumeUsd: 0,
    } as any);
  const holderCount = await db
    .select({ n: sql<number>`count(distinct ${schema.holder.address})` })
    .from(schema.holder)
    .where(
      and(eq(schema.holder.isExcluded, false), gt(schema.holder.balance, 0n)),
    );
  return j(c, {
    totalTokens: base.totalTokens,
    totalGraduated: base.totalGraduated,
    totalTrades: base.totalTrades,
    totalVolumeUsd: base.totalVolumeUsd,
    uniqueHolders: Number(holderCount[0]?.n ?? 0),
  });
});

// --- /tokens --------------------------------------------------------------
app.get("/tokens", async (c) => {
  const filter = c.req.query("filter") ?? "new";
  const limit = clampLimit(c.req.query("limit"), 50);
  const offset = Number(c.req.query("offset") ?? 0) || 0;

  const t = schema.token;
  let where: any = undefined;
  let orderBy: any = desc(t.launchedAt);

  switch (filter) {
    case "trending":
      orderBy = desc(t.volumeUsd);
      break;
    case "graduating":
      where = eq(t.graduated, false);
      orderBy = desc(t.progressBps);
      break;
    case "graduated":
      where = eq(t.graduated, true);
      orderBy = desc(t.graduatedAt);
      break;
    case "new":
    default:
      orderBy = desc(t.launchedAt);
      break;
  }

  let q: any = db.select().from(t);
  if (where) q = q.where(where);
  const rows = await q.orderBy(orderBy).limit(limit).offset(offset);
  return j(c, { filter, limit, offset, tokens: rows });
});

// --- /token/:addr ---------------------------------------------------------
app.get("/token/:addr", async (c) => {
  const addr = c.req.param("addr").toLowerCase() as `0x${string}`;
  const rows = await db
    .select()
    .from(schema.token)
    .where(eq(schema.token.address, addr))
    .limit(1);
  if (rows.length === 0) return j(c, { error: "not found" }, 404);

  const holders = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.holder)
    .where(
      and(
        eq(schema.holder.token, addr),
        eq(schema.holder.isExcluded, false),
        gt(schema.holder.balance, 0n),
      ),
    );
  return j(c, { ...rows[0], holderCount: Number(holders[0]?.n ?? 0) });
});

// --- /candles -------------------------------------------------------------
app.get("/candles", async (c) => {
  const token = c.req.query("token")?.toLowerCase() as `0x${string}` | undefined;
  const interval = c.req.query("interval") ?? "1m";
  const limit = clampLimit(c.req.query("limit"), 500, 2000);
  if (!token) return j(c, { error: "token required" }, 400);

  const rows = await db
    .select()
    .from(schema.candle)
    .where(
      and(
        eq(schema.candle.token, token),
        eq(schema.candle.interval, interval),
      ),
    )
    .orderBy(desc(schema.candle.bucketTs))
    .limit(limit);
  // return ascending for charting
  return j(c, { token, interval, candles: rows.reverse() });
});

// --- /trades --------------------------------------------------------------
app.get("/trades", async (c) => {
  const token = c.req.query("token")?.toLowerCase() as `0x${string}` | undefined;
  const limit = clampLimit(c.req.query("limit"), 50);
  const offset = Number(c.req.query("offset") ?? 0) || 0;

  let q: any = db.select().from(schema.trade);
  if (token) q = q.where(eq(schema.trade.token, token));
  const rows = await q
    .orderBy(desc(schema.trade.ts), desc(schema.trade.logIndex))
    .limit(limit)
    .offset(offset);
  return j(c, { token: token ?? null, limit, offset, trades: rows });
});

// --- /holders -------------------------------------------------------------
app.get("/holders", async (c) => {
  const token = c.req.query("token")?.toLowerCase() as `0x${string}` | undefined;
  const limit = clampLimit(c.req.query("limit"), 100);
  if (!token) return j(c, { error: "token required" }, 400);

  const rows = await db
    .select()
    .from(schema.holder)
    .where(
      and(
        eq(schema.holder.token, token),
        eq(schema.holder.isExcluded, false),
        gt(schema.holder.balance, 0n),
      ),
    )
    .orderBy(desc(schema.holder.balance))
    .limit(limit);
  return j(c, { token, count: rows.length, holders: rows });
});

// --- /portfolio/:addr -----------------------------------------------------
app.get("/portfolio/:addr", async (c) => {
  const addr = c.req.param("addr").toLowerCase() as `0x${string}`;
  const holdings = await db
    .select({
      token: schema.holder.token,
      balance: schema.holder.balance,
      name: schema.token.name,
      symbol: schema.token.symbol,
      lastPriceStock: schema.token.lastPriceStock,
      lastPriceUsd: schema.token.lastPriceUsd,
      graduated: schema.token.graduated,
    })
    .from(schema.holder)
    .leftJoin(schema.token, eq(schema.holder.token, schema.token.address))
    .where(and(eq(schema.holder.address, addr), gt(schema.holder.balance, 0n)))
    .orderBy(desc(schema.holder.balance));

  const stats = await db
    .select()
    .from(schema.userStats)
    .where(eq(schema.userStats.address, addr))
    .limit(1);

  // estimate current USD value of holdings (18-decimal tokens)
  const positions = holdings.map((h: any) => {
    const whole = Number(h.balance) / 1e18;
    const valueUsd = h.lastPriceUsd != null ? whole * h.lastPriceUsd : null;
    return { ...h, balanceWhole: whole, valueUsd };
  });
  const totalValueUsd = positions.reduce(
    (s: number, p: any) => s + (p.valueUsd ?? 0),
    0,
  );
  return j(c, {
    address: addr,
    stats: stats[0] ?? { address: addr, volumeUsd: 0, tradeCount: 0, launchCount: 0 },
    totalValueUsd,
    positions,
  });
});

// --- /top-users -----------------------------------------------------------
app.get("/top-users", async (c) => {
  const limit = clampLimit(c.req.query("limit"), 50);
  const rows = await db
    .select()
    .from(schema.userStats)
    .orderBy(desc(schema.userStats.volumeUsd))
    .limit(limit);
  return j(c, { limit, users: rows });
});

export default app;
