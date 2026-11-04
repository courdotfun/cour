// Formatting helpers. All token/stock amounts are raw units; always divide by
// the correct decimals (ERC-8056 aware) before display.
export function fromRaw(value: bigint, decimals: number): number {
  return Number(value) / 10 ** decimals;
}

export function toRaw(value: number | string, decimals: number): bigint {
  const s = typeof value === "number" ? value.toString() : value.trim();
  if (!s || isNaN(Number(s))) return 0n;
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (n < 0.01) return "$" + n.toPrecision(2);
  if (n < 1000) return "$" + n.toFixed(2);
  if (n < 1e6) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + (n / 1e6).toFixed(2) + "M";
}

export function fmtNum(n: number | null | undefined, dp = 4): string {
  if (n == null || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(dp);
}

export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return a.slice(0, 6) + "…" + a.slice(-4);
}

export function progressPct(progressBps: number): number {
  return Math.max(0, Math.min(100, progressBps / 100));
}
