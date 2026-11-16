import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb, dbConfigured, schema } from "@/db/client";
import { getSession } from "@/lib/server/session";
import { limitOr429 } from "@/lib/server/ratelimit";
import { normAddr, eqAddr } from "@/lib/util/address";

export const dynamic = "force-dynamic";

const Body = z.object({
  target: z.string(),
  action: z.enum(["follow", "unfollow"]),
});

// GET ?address= → follower/following counts (+ isFollowing relative to session)
export async function GET(req: Request) {
  const address = normAddr(new URL(req.url).searchParams.get("address"));
  if (!address) return Response.json({ error: "bad_address" }, { status: 400 });
  if (!dbConfigured()) return Response.json({ followers: 0, following: 0, isFollowing: false });
  const db = getDb();
  const [followers] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.follows)
    .where(eq(schema.follows.target, address));
  const [following] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.follows)
    .where(eq(schema.follows.follower, address));
  const session = await getSession();
  let isFollowing = false;
  if (session) {
    const rows = await db
      .select({ follower: schema.follows.follower })
      .from(schema.follows)
      .where(and(eq(schema.follows.follower, session.address.toLowerCase()), eq(schema.follows.target, address)))
      .limit(1);
    isFollowing = rows.length > 0;
  }
  return Response.json({ followers: followers?.n ?? 0, following: following?.n ?? 0, isFollowing });
}

export async function POST(req: Request) {
  const rl = limitOr429(req, "follow", 60, 60_000);
  if (rl) return rl;
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return Response.json({ error: "db_unavailable" }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const target = normAddr(parsed.data.target);
  if (!target) return Response.json({ error: "bad_target" }, { status: 400 });
  const follower = session.address.toLowerCase();
  if (eqAddr(follower, target)) return Response.json({ error: "cannot_follow_self" }, { status: 400 });

  const db = getDb();
  if (parsed.data.action === "follow") {
    await db.insert(schema.follows).values({ follower, target }).onConflictDoNothing();
  } else {
    await db
      .delete(schema.follows)
      .where(and(eq(schema.follows.follower, follower), eq(schema.follows.target, target)));
  }
  return Response.json({ ok: true });
}
