import { createConfig, factory } from "ponder";
import { getAbiItem } from "viem";

import { COURFactoryAbi } from "./abis/COURFactory";
import { COURFeeVaultAbi } from "./abis/COURFeeVault";
import { COURHookAbi } from "./abis/COURHook";
import { COURRouterAbi } from "./abis/COURRouter";
import { COURCurveAbi } from "./abis/COURCurve";
import { COURTokenAbi } from "./abis/COURToken";
import { PoolManagerAbi } from "./abis/PoolManager";
import {
  CHAIN_ID,
  CHAIN_NAME,
  FACTORY,
  FEE_VAULT,
  HOOK,
  ROUTER,
  POOL_MANAGER,
  START_BLOCK,
} from "./src/addresses";
import { POOL_ID_FILTER } from "./src/poolIds";

const rpc = process.env.PONDER_RPC_URL_4663;

// The factory event that announces each new token + its curve clone.
const tokenLaunched = getAbiItem({ abi: COURFactoryAbi, name: "TokenLaunched" });

export default createConfig({
  // `database` is omitted: Ponder uses pglite for dev and reads DATABASE_URL for
  // prod automatically. docker-compose sets DATABASE_URL + runs `ponder start`.
  chains: {
    [CHAIN_NAME]: {
      id: CHAIN_ID,
      rpc,
    },
  },
  contracts: {
    // -------------------------------------------------------- static contracts
    COURFactory: {
      chain: CHAIN_NAME,
      abi: COURFactoryAbi,
      address: FACTORY,
      startBlock: START_BLOCK,
    },
    COURFeeVault: {
      chain: CHAIN_NAME,
      abi: COURFeeVaultAbi,
      address: FEE_VAULT,
      startBlock: START_BLOCK,
    },
    COURHook: {
      chain: CHAIN_NAME,
      abi: COURHookAbi,
      address: HOOK,
      startBlock: START_BLOCK,
    },
    COURRouter: {
      chain: CHAIN_NAME,
      abi: COURRouterAbi,
      address: ROUTER,
      startBlock: START_BLOCK,
    },
    PoolManager: {
      chain: CHAIN_NAME,
      abi: PoolManagerAbi,
      address: POOL_MANAGER,
      startBlock: START_BLOCK,
      // Only index COUR pools (topic filter on the indexed `id`/PoolId), NOT every
      // pool on the chain. Without this, backfill scans millions of chain-wide v4
      // swaps. See src/poolIds.ts (regenerate on new graduations).
      filter: [
        { event: "Swap", args: { id: POOL_ID_FILTER } },
        { event: "ModifyLiquidity", args: { id: POOL_ID_FILTER } },
        { event: "Initialize", args: { id: POOL_ID_FILTER } },
      ],
    },

    // ------------------------------------------------------- dynamic contracts
    // Curve clones: one per launched token. Address comes from TokenLaunched.curve.
    COURCurve: {
      chain: CHAIN_NAME,
      abi: COURCurveAbi,
      startBlock: START_BLOCK,
      address: factory({
        address: FACTORY,
        event: tokenLaunched,
        parameter: "curve",
        startBlock: START_BLOCK,
      }),
    },
    // Launched ERC-20s: indexed for Transfer → holder balances. Address from TokenLaunched.token.
    COURToken: {
      chain: CHAIN_NAME,
      abi: COURTokenAbi,
      startBlock: START_BLOCK,
      address: factory({
        address: FACTORY,
        event: tokenLaunched,
        parameter: "token",
        startBlock: START_BLOCK,
      }),
    },
  },
});
