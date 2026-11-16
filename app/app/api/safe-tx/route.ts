import { z } from "zod";
import { getSession } from "@/lib/server/session";
import { limitOr429 } from "@/lib/server/ratelimit";
import { buildSafeTx, SAFE_ACTIONS } from "@/lib/server/safe";

export const dynamic = "force-dynamic";

// Safe 2-of-3 owners. Building a SafeTx file is not itself privileged (it only
// encodes a tx + reads a public nonce), but we still gate it to owners so the
// admin surface isn't exposed to arbitrary callers.
const OWNERS = new Set([
  "0x594527d8656d917ddfd32fcd5729dab349c75527",
  "0x4e284abb6881c5a62753088bb0e11cb9c447ee0e",
  "0x4b24652793d667c8840bca1fa991f855d896f1f7",
]);

const Body = z.object({
  action: z.enum(SAFE_ACTIONS as [string, ...string[]]),
  args: z.record(z.unknown()).default({}),
});

export async function GET() {
  // expose the available actions (used by the admin UI to render the form)
  return Response.json({ actions: SAFE_ACTIONS });
}

export async function POST(req: Request) {
  const rl = limitOr429(req, "safe-tx", 30, 60_000);
  if (rl) return rl;
  const session = await getSession();
  if (!session || !OWNERS.has(session.address.toLowerCase())) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  try {
    const result = await buildSafeTx(parsed.data.action, parsed.data.args);
    return Response.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "build_failed";
    return Response.json({ error: "build_failed", message: msg }, { status: 400 });
  }
}
