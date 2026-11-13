// Auto-discovered COUR graduated-pool ids — NO static list.
//
// At indexer startup we query COURFactory `Graduated` events and build the set of
// COUR poolIds. ponder.config.ts uses this to topic-filter PoolManager so we index
// ONLY COUR pools (not every v4 swap on the chain). Because Ponder's filter.args is
// fixed at config load, a pool that graduates AFTER startup is handled by a
// self-restart: the Graduated handler (src/index.ts) calls process.exit when it
// sees a poolId not in this startup set, and Railway (restartPolicy=ON_FAILURE)
// restarts the service → this loader re-runs → the new pool is included. No manual
// redeploy, no static file to maintain.
import { createPublicClient, http, parseAbiItem } from "viem";
import { FACTORY, START_BLOCK } from "./addresses";

const RPC = process.env.PONDER_RPC_URL_4663;
const GRADUATED = parseAbiItem(
  "event Graduated(address indexed token, bytes32 indexed poolId, uint256 tokenLiquidity, uint256 stockLiquidity, uint256 positionId)",
);
const ZERO_POOL_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

// Head block captured at startup — used to start the realtime stockUsd poll near
// the tip so backfill isn't flooded with price snapshots (backfill trades fall back
// to the current price; see src/lib.ts). Falls back to START_BLOCK if RPC is down.
let headAtStartup = BigInt(START_BLOCK);
let loaderOk = false;

async function loadGraduatedPoolIds(): Promise<`0x${string}`[]> {
  if (!RPC) return [];
  const client = createPublicClient({ transport: http(RPC) });
  const start = BigInt(START_BLOCK);
  let head: bigint;
  try {
    head = await client.getBlockNumber();
    headAtStartup = head;
  } catch {
    return []; // RPC down → loaderOk stays false (callers must NOT self-restart)
  }
  const ids = new Set<`0x${string}`>();
  // Try one wide query; fall back to chunks if the RPC range-limits getLogs.
  const pull = async (from: bigint, to: bigint) => {
    const logs = await client.getLogs({ address: FACTORY, event: GRADUATED, fromBlock: from, toBlock: to });
    for (const l of logs) if (l.args.poolId) ids.add(l.args.poolId as `0x${string}`);
  };
  try {
    await pull(start, head);
  } catch {
    const SPAN = 500_000n;
    for (let from = start; from <= head; from += SPAN) {
      const to = from + SPAN - 1n > head ? head : from + SPAN - 1n;
      try { await pull(from, to); } catch { /* skip a bad chunk; best-effort */ }
    }
  }
  loaderOk = true;
  return [...ids];
}

/** Graduated poolIds known at startup (empty on a fresh chain). */
export const COUR_POOL_IDS: `0x${string}`[] = await loadGraduatedPoolIds();

/** Block to start the realtime stockUsd poll (≈ head at startup). */
export const POLL_START_BLOCK: number = Number(headAtStartup);

/** True only if the Graduated query succeeded — gate self-restart on this so a
 *  transient RPC failure at startup can't cause a restart loop. */
export const LOADER_OK: boolean = loaderOk;

/** Never-empty list for the Ponder filter (empty args can mean "match all"). */
export const POOL_ID_FILTER: `0x${string}`[] =
  COUR_POOL_IDS.length > 0 ? COUR_POOL_IDS : [ZERO_POOL_ID];
