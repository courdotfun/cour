import { NextRequest, NextResponse } from "next/server";
import { indexerFetch } from "@/lib/server/indexer";

// Same-origin read proxy for the Ponder indexer. Keeps INDEXER_URL server-side
// and lets us cache. Only whitelisted indexer paths are forwarded.
const ALLOW = new Set([
  "stats",
  "tokens",
  "token",
  "candles",
  "trades",
  "holders",
  "portfolio",
  "top-users",
]);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  if (!path?.length || !ALLOW.has(path[0])) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const qs = req.nextUrl.search;
  try {
    const res = await indexerFetch("/" + path.join("/") + qs, { revalidate: 10 });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "public, max-age=5, stale-while-revalidate=30",
      },
    });
  } catch {
    return NextResponse.json({ error: "indexer_unreachable" }, { status: 502 });
  }
}
