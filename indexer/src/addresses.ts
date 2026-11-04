// COUR protocol deployment — chain 4663 ("Robinhood Chain").
// Mirrors ../../deployments/4663.json (kept inline so the indexer is self-contained).
import type { Hex } from "viem";

export const CHAIN_ID = 4663;
export const CHAIN_NAME = "courchain";

// Factory deployed at this block; CSMOKE smoke token launched at/after it.
export const START_BLOCK = 106215255;

export const FACTORY = "0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C" as const;
export const FEE_VAULT = "0x69263a34BebDeF24Db3384bfdf9c52794B3a0C76" as const;
export const HOOK = "0xD516b7F1F5F8556b731c5eaA1F0B0E19b080A0CC" as const;
export const ROUTER = "0x835Afd54F9BA20b18b6807B44886123E85A586f9" as const;
export const PRICE_READER = "0xF7C914E7B7580a7653DcC3b7574bf041F615e359" as const;
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;
export const CURVE_IMPL = "0x7E9dc67a6e0ADF7F35045569efdaE1424D023c00" as const;
export const GRADUATION_IMPL = "0xD98f73470D88CDFaCc55a63D34A341bC53efFCc7" as const;

export const DEAD = "0x000000000000000000000000000000000000dEaD" as const;
export const ZERO = "0x0000000000000000000000000000000000000000" as const;

// Addresses never counted as "holders" for a token (protocol plumbing).
const STATIC_EXCLUDED = new Set<string>(
  [FACTORY, FEE_VAULT, HOOK, ROUTER, POOL_MANAGER, DEAD, ZERO].map((a) =>
    a.toLowerCase(),
  ),
);

/** True when `addr` should be excluded from holder counts for `token`. */
export function isExcludedHolder(
  addr: Hex,
  tokenCurve: Hex | null | undefined,
): boolean {
  const a = addr.toLowerCase();
  if (STATIC_EXCLUDED.has(a)) return true;
  if (tokenCurve && a === tokenCurve.toLowerCase()) return true;
  return false;
}
