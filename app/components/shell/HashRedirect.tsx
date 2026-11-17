"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";

// Redirect legacy v8 hash routes (#/home, #/token/0x…) to the Next routes.
const MAP: Record<string, string> = {
  "#/home": "/",
  "#/profile": "/profile",
  "#/pools": "/pools",
  "#/create": "/create",
  "#/collection": "/collection",
};

export function HashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const h = typeof location !== "undefined" ? location.hash : "";
    if (!h) return;
    if (MAP[h]) { router.replace(MAP[h]); return; }
    const t = h.match(/^#\/(?:token|stock)\/(.+)$/);
    if (t) { router.replace(isAddress(t[1]) ? `/token/${t[1]}` : "/"); return; }
    const u = h.match(/^#\/(?:user|u)\/(.+)$/);
    if (u) { router.replace(isAddress(u[1]) ? `/u/${u[1]}` : "/"); return; }
  }, [router]);
  return null;
}
