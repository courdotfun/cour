import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { deployment, EXPLORER_URL } from "./deployment";

const RPC_URL =
  (import.meta.env.VITE_RPC_URL as string | undefined) ??
  "https://rpc.mainnet.chain.robinhood.com";

// Robinhood Chain (chainId 4663).
export const robinhoodChain = defineChain({
  id: deployment.chainId, // 4663
  name: deployment.network || "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Robin Etherscan", url: EXPLORER_URL },
  },
});

// Shared read-only client. Reused for every contract read + on-chain fallback.
export const publicClient: PublicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(RPC_URL, { batch: true }),
});

export const CHAIN_ID = deployment.chainId;
