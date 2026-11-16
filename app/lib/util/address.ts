import { isAddress } from "viem";

/** Validate and normalise to lowercase 0x address, or null. */
export function normAddr(a: unknown): string | null {
  if (typeof a !== "string") return null;
  const s = a.trim();
  if (!isAddress(s)) return null;
  return s.toLowerCase();
}

export function eqAddr(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
