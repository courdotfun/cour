// Direct on-chain reads via viem. Used for critical data (prices, quotes,
// balances, allowlist status) and as a fallback whenever the indexer is
// unreachable. No fabricated numbers: every value here comes from a contract.
import { publicClient } from "../chain/client";
import {
  curveAbi,
  erc20Abi,
  factoryAbi,
  feeVaultAbi,
  priceReaderAbi,
  routerAbi,
  tokenAbi,
} from "../chain/abi";
import { deployment, DEAD_ADDRESS } from "../chain/deployment";
import type { Hex } from "./types";

// ---- stock USD price (1e18-scaled) ----------------------------------------
export async function stockUsdPrice(stock: Hex): Promise<number | null> {
  try {
    const [priceX18] = (await publicClient.readContract({
      address: deployment.priceReader,
      abi: priceReaderAbi,
      functionName: "stockUsd",
      args: [stock],
    })) as [bigint, number];
    return Number(priceX18) / 1e18;
  } catch {
    return null;
  }
}

// ---- curve on-chain snapshot ----------------------------------------------
export interface CurveSnapshot {
  token: Hex;
  stock: Hex;
  creator: Hex;
  creatorFeeBps: number;
  mode: number;
  stockDecimals: number;
  launchedAt: number;
  graduated: boolean;
  progressBps: number;
  vS: bigint;
  vT: bigint;
}

export async function curveSnapshot(curve: Hex): Promise<CurveSnapshot | null> {
  try {
    const [config, graduated, progressBps, vS, vT] = await Promise.all([
      publicClient.readContract({ address: curve, abi: curveAbi, functionName: "config" }),
      publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduated" }),
      publicClient.readContract({ address: curve, abi: curveAbi, functionName: "progressBps" }),
      publicClient.readContract({ address: curve, abi: curveAbi, functionName: "vS" }),
      publicClient.readContract({ address: curve, abi: curveAbi, functionName: "vT" }),
    ]);
    const c = config as any;
    return {
      token: c.token,
      stock: c.stock,
      creator: c.creator,
      creatorFeeBps: Number(c.creatorFeeBps),
      mode: Number(c.mode),
      stockDecimals: Number(c.stockDecimals),
      launchedAt: Number(c.launchedAt),
      graduated: graduated as boolean,
      progressBps: Number(progressBps as bigint),
      vS: vS as bigint,
      vT: vT as bigint,
    };
  } catch {
    return null;
  }
}

export async function curveOf(token: Hex): Promise<Hex | null> {
  try {
    const c = (await publicClient.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "curveOf",
      args: [token],
    })) as Hex;
    return c === "0x0000000000000000000000000000000000000000" ? null : c;
  } catch {
    return null;
  }
}

// ---- quotes (critical: always on-chain) -----------------------------------
export async function quoteBuy(token: Hex, stockIn: bigint): Promise<bigint> {
  return (await publicClient.readContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "quoteBuy",
    args: [token, stockIn],
  })) as bigint;
}

export async function quoteSell(token: Hex, tokensIn: bigint): Promise<bigint> {
  return (await publicClient.readContract({
    address: deployment.router,
    abi: routerAbi,
    functionName: "quoteSell",
    args: [token, tokensIn],
  })) as bigint;
}

// Curve-level detailed buy quote: (tokensOut, feeStock, taxStock).
export async function quoteBuyDetailed(
  curve: Hex,
  stockIn: bigint,
): Promise<{ tokensOut: bigint; fee: bigint; tax: bigint }> {
  const [tokensOut, fee, tax] = (await publicClient.readContract({
    address: curve,
    abi: curveAbi,
    functionName: "quoteBuy",
    args: [stockIn],
  })) as [bigint, bigint, bigint];
  return { tokensOut, fee, tax };
}

// ---- ERC-20 helpers --------------------------------------------------------
export async function erc20Balance(token: Hex, owner: Hex): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

export async function erc20Allowance(token: Hex, owner: Hex, spender: Hex): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;
}

export async function erc20Meta(token: Hex): Promise<{ symbol: string; decimals: number }> {
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }) as Promise<string>,
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
  ]);
  return { symbol, decimals: Number(decimals) };
}

export async function nativeBalance(owner: Hex): Promise<bigint> {
  return publicClient.getBalance({ address: owner });
}

// ---- allowlist (launch gating) --------------------------------------------
export async function isLaunchAllowed(addr: Hex): Promise<boolean> {
  try {
    const [enabled, allowed] = await Promise.all([
      publicClient.readContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "launchAllowlistEnabled",
      }) as Promise<boolean>,
      publicClient.readContract({
        address: deployment.factory,
        abi: factoryAbi,
        functionName: "launchAllowlist",
        args: [addr],
      }) as Promise<boolean>,
    ]);
    return !enabled || allowed;
  } catch {
    return false;
  }
}

// ---- graduation proof ------------------------------------------------------
// Graduation burns the full-range LP (positionId recorded as 0 in events) — the
// position NFT is owned by dead/factory with no removal path. This confirms the
// pool exists and surfaces the poolId for an explorer link.
export async function poolIdOf(token: Hex): Promise<Hex | null> {
  try {
    const id = (await publicClient.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "poolIdOf",
      args: [token],
    })) as Hex;
    const zero = "0x0000000000000000000000000000000000000000000000000000000000000000";
    return id === zero ? null : id;
  } catch {
    return null;
  }
}

export const BURN_ADDRESS = DEAD_ADDRESS;

// ---- fee / claim reads -----------------------------------------------------
export async function creatorOwed(token: Hex): Promise<bigint> {
  return (await publicClient.readContract({
    address: deployment.feeVault,
    abi: feeVaultAbi,
    functionName: "creatorOwed",
    args: [token],
  })) as bigint;
}
export async function pendingHolder(token: Hex, holder: Hex): Promise<bigint> {
  return (await publicClient.readContract({
    address: deployment.feeVault,
    abi: feeVaultAbi,
    functionName: "pendingHolder",
    args: [token, holder],
  })) as bigint;
}
export async function buybackOwed(token: Hex): Promise<bigint> {
  return (await publicClient.readContract({
    address: deployment.feeVault,
    abi: feeVaultAbi,
    functionName: "buybackOwed",
    args: [token],
  })) as bigint;
}
export async function platformOwed(stock: Hex): Promise<bigint> {
  return (await publicClient.readContract({
    address: deployment.feeVault,
    abi: feeVaultAbi,
    functionName: "platformOwed",
    args: [stock],
  })) as bigint;
}

export async function tokenCreator(token: Hex): Promise<Hex | null> {
  try {
    return (await publicClient.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "creator",
    })) as Hex;
  } catch {
    return null;
  }
}

export async function factoryOwner(): Promise<Hex> {
  return (await publicClient.readContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "owner",
  })) as Hex;
}
