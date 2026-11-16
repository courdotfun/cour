import { SiweMessage } from "siwe";
import { z } from "zod";
import { takeNonce, createSession } from "@/lib/server/session";
import { limitOr429 } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

const Body = z.object({ message: z.string().max(4000), signature: z.string().max(500) });
const CHAIN_ID = 4663;

export async function POST(req: Request) {
  const rl = limitOr429(req, "auth", 20, 60_000);
  if (rl) return rl;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const expectedNonce = await takeNonce();
  if (!expectedNonce) return Response.json({ error: "nonce_expired" }, { status: 401 });

  try {
    const msg = new SiweMessage(parsed.data.message);
    const res = await msg.verify({ signature: parsed.data.signature, nonce: expectedNonce });
    if (!res.success) return Response.json({ error: "verify_failed" }, { status: 401 });
    if (msg.chainId !== CHAIN_ID) return Response.json({ error: "wrong_chain" }, { status: 401 });
    await createSession(msg.address);
    return Response.json({ ok: true, address: msg.address.toLowerCase() });
  } catch {
    return Response.json({ error: "verify_failed" }, { status: 401 });
  }
}
