import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, dbConfigured, schema } from "@/db/client";
import { getSession } from "@/lib/server/session";
import { limitOr429 } from "@/lib/server/ratelimit";
import { normAddr, eqAddr } from "@/lib/util/address";
import { getTokenCreator } from "@/lib/server/chain";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1).max(4000),
});

export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const token = normAddr((await ctx.params).address);
  if (!token) return Response.json({ error: "bad_token" }, { status: 400 });
  if (!dbConfigured()) return Response.json({ updates: [] });
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.tokenUpdates)
    .where(eq(schema.tokenUpdates.token, token))
    .orderBy(desc(schema.tokenUpdates.createdAt))
    .limit(100);
  return Response.json({ updates: rows });
}

export async function POST(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const rl = limitOr429(req, "updates", 20, 60_000);
  if (rl) return rl;
  const token = normAddr((await ctx.params).address);
  if (!token) return Response.json({ error: "bad_token" }, { status: 400 });

  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return Response.json({ error: "db_unavailable" }, { status: 503 });

  // creator-only: the session address must be the on-chain creator of this token.
  const creator = await getTokenCreator(token);
  if (!creator) return Response.json({ error: "unknown_token" }, { status: 404 });
  if (!eqAddr(creator, session.address)) {
    return Response.json({ error: "not_creator" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const db = getDb();
  const [row] = await db
    .insert(schema.tokenUpdates)
    .values({
      token,
      author: session.address.toLowerCase(),
      title: parsed.data.title ?? null,
      body: parsed.data.body,
    })
    .returning();
  return Response.json({ ok: true, update: row });
}
