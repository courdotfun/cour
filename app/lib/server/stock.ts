import "server-only";
import type { TokenDetail } from "./token";
import { fixtureStockDetail } from "@/lib/fixtureStock";
import { deployment } from "@/lib/chain/deployment";
import { stockUsdPrice } from "@/lib/data/onchain";
import type { Hex } from "viem";

const FIXTURE = process.env.NEXT_PUBLIC_VISUAL_FIXTURE === "1";

// symbol → on-chain stock token address (real). Only NVDA is configured on mainnet today.
const STOCKS: Record<string, { name: string; address: Hex }> = {
  NVDA: { name: "NVIDIA", address: deployment.nvda as Hex },
};

export async function loadStock(symbol: string): Promise<TokenDetail | null> {
  const sym = symbol.toUpperCase();
  if (FIXTURE) return fixtureStockDetail(sym);
  const s = STOCKS[sym];
  if (!s) return null;
  let priceUsd: number | null = null;
  try { priceUsd = await stockUsdPrice(s.address); } catch { priceUsd = null; }
  const base = fixtureStockDetail(sym); // reuse the neutral static chrome shape
  if (!base) return null;
  return {
    ...base,
    ui: { ...base.ui, address: s.address, pairedStock: s.address, lastPriceUsd: priceUsd },
    raw: { ...base.raw, address: s.address, stock: s.address },
  };
}
