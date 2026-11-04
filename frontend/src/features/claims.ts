// Fee claims + buyback execution via COURFeeVault.
//  - claim(token)        creator fees (CREATOR mode)
//  - claimHolder(token)  holder dividends (HOLDERS mode)
//  - executeBuyback(..)  modes 2/3, guarded by min $50 / TWAP on-chain
//  - claimPlatform(stock) owner only (admin dashboard)
import { feeVaultAbi } from "../chain/abi";
import { deployment } from "../chain/deployment";
import { publicClient } from "../chain/client";
import { ensureChain, getWallet, requireWalletClient } from "../chain/wallet";
import type { Hex } from "../data/types";

async function send(functionName: string, args: readonly unknown[]): Promise<Hex> {
  const { address } = getWallet();
  if (!address) throw new Error("Connect a wallet first");
  await ensureChain();
  const wc = requireWalletClient();
  const hash = await wc.writeContract({
    address: deployment.feeVault,
    abi: feeVaultAbi,
    functionName: functionName as any,
    args: args as any,
    account: address,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export const claimCreator = (token: Hex) => send("claim", [token]);
export const claimHolder = (token: Hex) => send("claimHolder", [token]);
export const claimPlatform = (stock: Hex) => send("claimPlatform", [stock]);

// maxStockIn caps the buyback spend; minTokensOut is slippage protection.
export const executeBuyback = (token: Hex, maxStockIn: bigint, minTokensOut: bigint) =>
  send("executeBuyback", [token, maxStockIn, minTokensOut]);
