import "server-only";
import { createPublicClient, http, type Hex } from "viem";
import { robinhoodChain } from "@/lib/chain/client";
import { indexerJson } from "./indexer";

const RPC =
  process.env.RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://rpc.mainnet.chain.robinhood.com";

// Server-side read client (may use a private RPC via RPC_URL).
export const serverClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(RPC, { batch: true }),
});

const tokenCreatorAbi = [
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

/** On-chain creator of a COUR token. Prefers the indexer, falls back to the token contract. */
export async function getTokenCreator(token: string): Promise<string | null> {
  const t = await indexerJson<{ creator?: string }>(`/token/${token.toLowerCase()}`);
  if (t?.creator) return t.creator.toLowerCase();
  try {
    const c = await serverClient.readContract({
      address: token as Hex,
      abi: tokenCreatorAbi,
      functionName: "creator",
    });
    return (c as string).toLowerCase();
  } catch {
    return null;
  }
}
