// Buy / sell COUR curve tokens via COURRouter. Quotes are on-chain; slippage +
// deadline applied client-side; ERC-20 approve handled before buy with stock.
import { erc20Abi, routerAbi } from "../chain/abi";
import { deployment } from "../chain/deployment";
import { publicClient } from "../chain/client";
import { ensureChain, requireWalletClient, getWallet } from "../chain/wallet";
import { quoteBuy, quoteSell, erc20Allowance } from "../data/onchain";
import type { Hex } from "../data/types";

export interface TradeQuote {
  amountOut: bigint;
  minOut: bigint;
  slippageBps: number;
}

function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

function deadlineFrom(secs: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + secs);
}

export async function previewBuy(token: Hex, stockIn: bigint, slippageBps = 100): Promise<TradeQuote> {
  const amountOut = await quoteBuy(token, stockIn);
  return { amountOut, minOut: applySlippage(amountOut, slippageBps), slippageBps };
}

export async function previewSell(token: Hex, tokensIn: bigint, slippageBps = 100): Promise<TradeQuote> {
  const amountOut = await quoteSell(token, tokensIn);
  return { amountOut, minOut: applySlippage(amountOut, slippageBps), slippageBps };
}

// Ensure the router can pull `amount` of `stock` from the connected wallet.
export async function ensureAllowance(stock: Hex, amount: bigint): Promise<Hex | null> {
  const { address } = getWallet();
  if (!address) throw new Error("Connect a wallet first");
  const current = await erc20Allowance(stock, address, deployment.router);
  if (current >= amount) return null;
  await ensureChain();
  const wc = requireWalletClient();
  const hash = await wc.writeContract({
    address: stock,
    abi: erc20Abi,
    functionName: "approve",
    args: [deployment.router, amount],
    account: address,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function buy(
  token: Hex,
  stock: Hex,
  stockIn: bigint,
  minOut: bigint,
  deadlineSecs = 1200,
): Promise<Hex> {
  const { address } = getWallet();
  if (!address) throw new Error("Connect a wallet first");
  await ensureAllowance(stock, stockIn);
  await ensureChain();
  const wc = requireWalletClient();
  const hash = await wc.writeContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "buy",
    args: [token, stockIn, minOut, deadlineFrom(deadlineSecs)],
    account: address,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function buyWithETH(
  token: Hex,
  ethIn: bigint,
  minOut: bigint,
  deadlineSecs = 1200,
): Promise<Hex> {
  const { address } = getWallet();
  if (!address) throw new Error("Connect a wallet first");
  await ensureChain();
  const wc = requireWalletClient();
  const hash = await wc.writeContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "buyWithETH",
    args: [token, minOut, deadlineFrom(deadlineSecs)],
    value: ethIn,
    account: address,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function sell(
  token: Hex,
  tokensIn: bigint,
  minOut: bigint,
  deadlineSecs = 1200,
): Promise<Hex> {
  const { address } = getWallet();
  if (!address) throw new Error("Connect a wallet first");
  // The COUR token must approve the router to pull tokens.
  const current = await erc20Allowance(token, address, deployment.router);
  if (current < tokensIn) {
    await ensureChain();
    const wc0 = requireWalletClient();
    const ah = await wc0.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [deployment.router, tokensIn],
      account: address,
      chain: null,
    });
    await publicClient.waitForTransactionReceipt({ hash: ah });
  }
  await ensureChain();
  const wc = requireWalletClient();
  const hash = await wc.writeContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "sell",
    args: [token, tokensIn, minOut, deadlineFrom(deadlineSecs)],
    account: address,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
