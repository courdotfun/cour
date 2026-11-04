// Buy / sell the underlying STOCK tokens (NVDA, ...) with ETH or USDG via
// Uniswap SwapRouter02 exactInputSingle. Used by the stock pages and by the
// Launch flow when a user only holds ETH and needs stock for the initial buy.
import { erc20Abi, swapRouter02Abi } from "../chain/abi";
import { deployment, extraAddresses } from "../chain/deployment";
import { publicClient } from "../chain/client";
import { ensureChain, getWallet, requireWalletClient } from "../chain/wallet";
import { erc20Allowance } from "../data/onchain";
import type { Hex } from "../data/types";

const ROUTER = extraAddresses.v3SwapRouter02;
const DEFAULT_FEE = 3000; // 0.3% pool tier; adjust per-pool as needed.

function deadlineUnused() {
  // SwapRouter02 dropped the deadline arg from exactInputSingle params.
}

export interface StockSwapResult {
  txHash: Hex;
  amountOut: bigint;
}

// ETH -> stock (via WETH). amountOutMin from a caller-supplied quote + slippage.
export async function swapEthForStock(
  stock: Hex,
  ethIn: bigint,
  amountOutMin: bigint,
  fee = DEFAULT_FEE,
): Promise<StockSwapResult> {
  const { address } = getWallet();
  if (!address) throw new Error("Connect a wallet first");
  await ensureChain();
  const wc = requireWalletClient();
  const hash = await wc.writeContract({
    address: ROUTER,
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: deployment.weth,
        tokenOut: stock,
        fee,
        recipient: address,
        amountIn: ethIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n,
      },
    ],
    value: ethIn,
    account: address,
    chain: null,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  void receipt;
  return { txHash: hash, amountOut: amountOutMin };
}

// ERC20 -> stock (e.g. USDG -> NVDA). Approves the router if needed.
export async function swapTokenForStock(
  tokenIn: Hex,
  stock: Hex,
  amountIn: bigint,
  amountOutMin: bigint,
  fee = DEFAULT_FEE,
): Promise<StockSwapResult> {
  const { address } = getWallet();
  if (!address) throw new Error("Connect a wallet first");
  const current = await erc20Allowance(tokenIn, address, ROUTER);
  if (current < amountIn) {
    await ensureChain();
    const wc0 = requireWalletClient();
    const ah = await wc0.writeContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: "approve",
      args: [ROUTER, amountIn],
      account: address,
      chain: null,
    });
    await publicClient.waitForTransactionReceipt({ hash: ah });
  }
  await ensureChain();
  const wc = requireWalletClient();
  const hash = await wc.writeContract({
    address: ROUTER,
    abi: swapRouter02Abi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut: stock,
        fee,
        recipient: address,
        amountIn,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: 0n,
      },
    ],
    account: address,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { txHash: hash, amountOut: amountOutMin };
}
