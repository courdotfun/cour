// Server-side IPFS upload (Pinata) — keeps the Pinata JWT OFF the client.
//
// POST multipart/form-data with a single `file` (image) → pins the image.
// POST application/json with token metadata → pins a metadata JSON document.
// Returns { cid, url }. The frontend uses `ipfs://<cid>` as the metadataURI.
//
// Hardening: 2 MB cap, image type verified by MAGIC BYTES (not just the header),
// a simple per-IP rate limit, and generic error bodies that never leak the JWT
// or Pinata's internal responses.
//
// Env (server-only, NEVER prefixed VITE_ so it is never bundled into the client):
//   PINATA_JWT       required — Pinata API JWT
//   PINATA_GATEWAY   optional — gateway base for the returned `url`
export const config = { runtime: "edge" };

// `process.env` is available in the Vercel Edge runtime; declare it so this file
// typechecks without pulling in @types/node (it is outside the app tsconfig).
declare const process: { env: Record<string, string | undefined> };

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const RATE_MAX = 10; // uploads
const RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes, per IP
const hits = new Map<string, number[]>(); // best-effort, per-isolate

const PINATA_JWT = process.env.PINATA_JWT;
const GATEWAY = (process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud").replace(/\/$/, "");
const PIN_FILE = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    hits.set(ip, arr);
    return true;
  }
  arr.push(now);
  hits.set(ip, arr);
  // opportunistic cleanup to bound memory
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
  }
  return false;
}

// Verify real image type by magic bytes. Returns the mime or null.
function sniffImage(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  return null;
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

// Only allow http(s)/ipfs links; drop anything else.
function link(v: unknown): string | undefined {
  const s = str(v, 400);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s) || /^ipfs:\/\//i.test(s)) return s;
  return undefined;
}

function sanitizeMeta(body: Record<string, unknown>): Record<string, unknown> | null {
  const name = str(body.name, 64);
  const symbol = str(body.symbol, 16);
  if (!name && !symbol) return null;
  const image = str(body.image, 400);
  const linksIn = (body.links && typeof body.links === "object") ? (body.links as Record<string, unknown>) : {};
  const links: Record<string, string> = {};
  for (const k of ["website", "x", "twitter", "telegram", "discord"]) {
    const l = link(linksIn[k]);
    if (l) links[k] = l;
  }
  const meta: Record<string, unknown> = {};
  if (name) meta.name = name;
  if (symbol) meta.symbol = symbol;
  const description = str(body.description, 2000);
  if (description) meta.description = description;
  if (image && (image.startsWith("ipfs://") || /^https?:\/\//i.test(image))) meta.image = image;
  if (Object.keys(links).length) meta.links = links;
  return meta;
}

async function pinFile(ab: ArrayBuffer, mime: string): Promise<string> {
  const ext = mime.split("/")[1] || "bin";
  const form = new FormData();
  form.append("file", new Blob([ab], { type: mime }), `logo.${ext}`);
  form.append("pinataMetadata", JSON.stringify({ name: "cour-token-image" }));
  const res = await fetch(PIN_FILE, { method: "POST", headers: { Authorization: `Bearer ${PINATA_JWT}` }, body: form });
  if (!res.ok) throw new Error("pin_file_failed");
  const data = (await res.json()) as { IpfsHash?: string };
  if (!data.IpfsHash) throw new Error("pin_file_no_cid");
  return data.IpfsHash;
}

async function pinJSON(meta: Record<string, unknown>): Promise<string> {
  const res = await fetch(PIN_JSON, {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}`, "content-type": "application/json" },
    body: JSON.stringify({ pinataContent: meta, pinataMetadata: { name: "cour-token-metadata" } }),
  });
  if (!res.ok) throw new Error("pin_json_failed");
  const data = (await res.json()) as { IpfsHash?: string };
  if (!data.IpfsHash) throw new Error("pin_json_no_cid");
  return data.IpfsHash;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!PINATA_JWT) return json(500, { error: "upload_unavailable" });

  const ip = clientIp(req);
  if (rateLimited(ip)) return json(429, { error: "rate_limited", message: "Too many uploads. Try again in a few minutes." });

  const ct = (req.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== "object") return json(400, { error: "bad_request" });
      const meta = sanitizeMeta(body);
      if (!meta) return json(400, { error: "bad_request", message: "name or symbol required." });
      const cid = await pinJSON(meta);
      return json(200, { cid, url: `${GATEWAY}/ipfs/${cid}` });
    }

    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json(400, { error: "no_file", message: "Attach an image as `file`." });
      if (file.size > MAX_BYTES) return json(413, { error: "too_large", message: "Max image size is 2 MB." });
      const ab = await file.arrayBuffer();
      if (ab.byteLength > MAX_BYTES) return json(413, { error: "too_large", message: "Max image size is 2 MB." });
      const mime = sniffImage(new Uint8Array(ab));
      if (!mime) return json(415, { error: "unsupported_type", message: "Only PNG, JPEG, WebP or GIF images are allowed." });
      const cid = await pinFile(ab, mime);
      return json(200, { cid, url: `${GATEWAY}/ipfs/${cid}` });
    }

    return json(415, { error: "unsupported_content_type", message: "Use multipart/form-data (image) or application/json (metadata)." });
  } catch {
    // Never surface PINATA_JWT or Pinata's internal error body.
    return json(500, { error: "upload_failed", message: "Upload failed. Please try again." });
  }
}
