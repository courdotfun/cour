import { generateNonce } from "siwe";
import { setNonce } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const nonce = generateNonce();
  await setNonce(nonce);
  return Response.json({ nonce });
}
