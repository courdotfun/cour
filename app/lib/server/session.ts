import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "cour_session";
const NONCE_COOKIE = "cour_siwe_nonce";
const PROD = process.env.NODE_ENV === "production";

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET not set (>=16 chars)");
  return new TextEncoder().encode(s);
}

const base = {
  httpOnly: true,
  secure: PROD,
  sameSite: "lax" as const,
  path: "/",
};

export async function createSession(address: string): Promise<void> {
  const token = await new SignJWT({ address: address.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, { ...base, maxAge: 60 * 60 * 24 * 7 });
}

export async function getSession(): Promise<{ address: string } | null> {
  const c = (await cookies()).get(SESSION_COOKIE);
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c.value, secret());
    const address = typeof payload.address === "string" ? payload.address : null;
    return address ? { address } : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function setNonce(nonce: string): Promise<void> {
  (await cookies()).set(NONCE_COOKIE, nonce, { ...base, maxAge: 600 });
}

/** Read and consume (single-use) the SIWE nonce cookie. */
export async function takeNonce(): Promise<string | null> {
  const jar = await cookies();
  const c = jar.get(NONCE_COOKIE);
  if (!c) return null;
  jar.delete(NONCE_COOKIE);
  return c.value;
}
