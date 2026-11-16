"use client";

// Minimal client Sign-In with Ethereum against /api/auth/*. Uses the injected
// wallet (window.ethereum). siwe is lazy-imported to keep it off the initial bundle.
export async function siweSignIn(): Promise<string> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found");
  const { SiweMessage } = await import("siwe");
  const [address]: string[] = await eth.request({ method: "eth_requestAccounts" });
  const nonceRes = await fetch("/api/auth/nonce");
  const { nonce } = await nonceRes.json();
  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: "Sign in to COUR.",
    uri: window.location.origin,
    version: "1",
    chainId: 4663,
    nonce,
  }).prepareMessage();
  const signature: string = await eth.request({ method: "personal_sign", params: [message, address] });
  const verify = await fetch("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (!verify.ok) throw new Error("Sign-in failed");
  const { address: addr } = await verify.json();
  return addr;
}

export async function currentSession(): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/me");
    const j = await r.json();
    return j.address ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
