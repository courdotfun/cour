// Shared, read-only snapshot of what the monitor has observed, surfaced via HTTP.

export interface HealthSnapshot {
  startedAt: string;
  lastBlock: string | null;
  lastBlockAt: string | null;
  deployerEth: string | null;
  stockUsdNvda: string | null; // human-readable USD, e.g. "199.84"
  stockUsdSource: number | null; // PriceReader source enum
  twapReady: boolean | null;
  launchesPaused: boolean | null;
  launchAllowlistEnabled: boolean | null;
  stockPaused: boolean | null; // null = probe unsupported/unknown
  owners: Record<string, string>;
  pendingOwners: Record<string, string>; // contract -> pendingOwner (0x0 if none)
  ownerBalances: Record<string, string>; // Safe owner addr -> ETH (human)
  lastHealthCheckAt: string | null;
  lastError: string | null;
}

export const snapshot: HealthSnapshot = {
  startedAt: new Date().toISOString(),
  lastBlock: null,
  lastBlockAt: null,
  deployerEth: null,
  stockUsdNvda: null,
  stockUsdSource: null,
  twapReady: null,
  launchesPaused: null,
  launchAllowlistEnabled: null,
  stockPaused: null,
  owners: {},
  pendingOwners: {},
  ownerBalances: {},
  lastHealthCheckAt: null,
  lastError: null,
};

export function setLastBlock(block: bigint): void {
  snapshot.lastBlock = block.toString();
  snapshot.lastBlockAt = new Date().toISOString();
}
