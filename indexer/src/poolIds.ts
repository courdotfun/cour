// COUR graduated-pool ids (bytes32), used to topic-filter PoolManager events so
// the indexer fetches ONLY swaps/liquidity for COUR pools — not every pool on the
// chain. Ponder's `filter.args` is static (no dynamic topic factory), so this list
// must be regenerated when new pools graduate, then the indexer redeployed.
//
// HOW TO REGENERATE (the monitor alerts on each COURFactory `Graduated` event):
//   cast logs --from-block 106215255 --to-block latest \
//     --address 0x771a90Ff8E9Be8dC9091494D9466C35D162c0f4C \
//     "Graduated(address indexed token, bytes32 indexed poolId, uint256, uint256, uint256)" \
//     --rpc-url <4663-rpc>
//   → copy each poolId (topic2) into COUR_POOL_IDS below.
//
// As of 2026-11-14: 0 graduated pools (closed allowlist beta; graduation needs
// $60k mcap). The zero-hash sentinel makes PoolManager fetch effectively nothing.
export const COUR_POOL_IDS: readonly `0x${string}`[] = [
  // "0x<poolId>",  // add graduated poolIds here, then redeploy
];

const ZERO_POOL_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/** Never-empty list for the Ponder filter (empty args can mean "match all"). */
export const POOL_ID_FILTER: readonly `0x${string}`[] =
  COUR_POOL_IDS.length > 0 ? COUR_POOL_IDS : [ZERO_POOL_ID];
