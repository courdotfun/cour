import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, dbConfigured, schema } from "@/db/client";
import { getSession } from "@/lib/server/session";
import { limitOr429 } from "@/lib/server/ratelimit";
import { normAddr } from "@/lib/util/address";

export const dynamic = "force-dynamic";

const link = z.string().trim().max(400).url().optional().or(z.literal(""));
const Body = z.object({
  name: z.string().trim().max(64).optional(),
  bio: z.string().trim().max(2000).optional(),
  avatarCid: z.string().trim().max(100).optional(),
  website: link,
  x: z.string().trim().max(120).optional(),
  telegram: z.string().trim().max(120).optional(),
  discord: z.string().trim().max(120).optional(),
});

export async function GET(req: Request) {
  const address = normAddr(new URL(req.url).searchParams.get("address"));
  if (!address) return Response.json({ error: "bad_address" }, { status: 400 });
  if (!dbConfigured()) return Response.json({ profile: null });
  const db = getDb();
  const rows = await db.select().from(schema.profiles).where(eq(schema.profiles.address, address)).limit(1);
  return Response.json({ profile: rows[0] ?? null });
}

export async function PUT(req: Request) {
  const rl = limitOr429(req, "profile", 30, 60_000);
  if (rl) return rl;
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!dbConfigured()) return Response.json({ error: "db_unavailable" }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request", issues: parsed.error.issues }, { status: 400 });

  const address = session.address.toLowerCase();
  const values = { address, ...parsed.data, updatedAt: new Date() };
  const db = getDb();
  await db
    .insert(schema.profiles)
    .values(values)
    .onConflictDoUpdate({ target: schema.profiles.address, set: { ...parsed.data, updatedAt: new Date() } });
  const rows = await db.select().from(schema.profiles).where(eq(schema.profiles.address, address)).limit(1);
  return Response.json({ ok: true, profile: rows[0] });
}
