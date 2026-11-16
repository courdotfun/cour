import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  return Response.json({ address: s?.address ?? null });
}
