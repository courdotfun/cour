import "server-only";

// Server-only indexer access. The deployed Ponder indexer URL (Railway) is the
// default; override with INDEXER_URL. Never exposed to the browser — the client
// reads through /api/ix/* (app/app/api/ix/[...path]/route.ts).
export const INDEXER_URL = (
  process.env.INDEXER_URL ?? "https://indexer-production-f5ef70d7.up.railway.app"
).replace(/\/$/, "");

export async function indexerFetch(
  path: string,
  opts: { revalidate?: number } = {},
): Promise<Response> {
  const url = INDEXER_URL + (path.startsWith("/") ? path : "/" + path);
  return fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: opts.revalidate ?? 10 },
  });
}

export async function indexerJson<T>(path: string, opts?: { revalidate?: number }): Promise<T | null> {
  try {
    const res = await indexerFetch(path, opts);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
