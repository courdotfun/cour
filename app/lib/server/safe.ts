import "server-only";
import {
  encodeFunctionData,
  hashTypedData,
  getAddress,
  type Abi,
  type Hex,
} from "viem";
import { z } from "zod";
import { serverClient } from "./chain";
import { deployment } from "@/lib/chain/deployment";
import factoryAbiJson from "@/lib/chain/abi/COURFactory.json";
import feeVaultAbiJson from "@/lib/chain/abi/COURFeeVault.json";

const factoryAbi = factoryAbiJson as Abi;
const feeVaultAbi = feeVaultAbiJson as Abi;

// Owner of all four contracts is the Safe 2-of-3.
export const SAFE = getAddress("0xDca6d36E44E848a7C4088Fb5d12FfDEd22EA7fA2");
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const CHAIN_ID = 4663;
const FACTORY = getAddress(deployment.factory);
const FEE_VAULT = getAddress(deployment.feeVault);

const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "bad address");
const uintStr = z.string().regex(/^\d+$/, "must be an integer string");

// Whitelisted owner-only admin actions. Each builds a single CALL (operation 0).
type ActionDef = {
  target: Hex;
  abi: Abi;
  fn: string;
  schema: z.ZodTypeAny;
  args: (p: any) => readonly unknown[];
  describe: (p: any) => string;
};

const ACTIONS: Record<string, ActionDef> = {
  setLaunchesPaused: {
    target: FACTORY, abi: factoryAbi, fn: "setLaunchesPaused",
    schema: z.object({ paused: z.boolean() }),
    args: (p) => [p.paused],
    describe: (p) => `COURFactory.setLaunchesPaused(${p.paused})`,
  },
  setLaunchAllowlist: {
    target: FACTORY, abi: factoryAbi, fn: "setLaunchAllowlist",
    schema: z.object({ account: addr, allowed: z.boolean() }),
    args: (p) => [getAddress(p.account), p.allowed],
    describe: (p) => `COURFactory.setLaunchAllowlist(${p.account}, ${p.allowed})`,
  },
  setLaunchAllowlistEnabled: {
    target: FACTORY, abi: factoryAbi, fn: "setLaunchAllowlistEnabled",
    schema: z.object({ enabled: z.boolean() }),
    args: (p) => [p.enabled],
    describe: (p) => `COURFactory.setLaunchAllowlistEnabled(${p.enabled})`,
  },
  setLaunchParams: {
    target: FACTORY, abi: factoryAbi, fn: "setLaunchParams",
    schema: z.object({ startMcUsd: uintStr, gradMcUsd: uintStr, minRefLiqUsd: uintStr, launchFee: uintStr }),
    args: (p) => [BigInt(p.startMcUsd), BigInt(p.gradMcUsd), BigInt(p.minRefLiqUsd), BigInt(p.launchFee)],
    describe: (p) => `COURFactory.setLaunchParams(${p.startMcUsd}, ${p.gradMcUsd}, ${p.minRefLiqUsd}, ${p.launchFee})`,
  },
  setStock: {
    target: FACTORY, abi: factoryAbi, fn: "setStock",
    schema: z.object({ stock: addr, allowed: z.boolean(), refPool: addr, kind: z.number().int().min(0).max(255) }),
    args: (p) => [getAddress(p.stock), p.allowed, getAddress(p.refPool), p.kind],
    describe: (p) => `COURFactory.setStock(${p.stock}, ${p.allowed}, ${p.refPool}, ${p.kind})`,
  },
  setMinBuybackUsd: {
    target: FEE_VAULT, abi: feeVaultAbi, fn: "setMinBuybackUsd",
    schema: z.object({ amount: uintStr }),
    args: (p) => [BigInt(p.amount)],
    describe: (p) => `COURFeeVault.setMinBuybackUsd(${p.amount})`,
  },
  setTreasury: {
    target: FEE_VAULT, abi: feeVaultAbi, fn: "setTreasury",
    schema: z.object({ treasury: addr }),
    args: (p) => [getAddress(p.treasury)],
    describe: (p) => `COURFeeVault.setTreasury(${p.treasury})`,
  },
  setFeeRecipient: {
    target: FEE_VAULT, abi: feeVaultAbi, fn: "setFeeRecipient",
    schema: z.object({ token: addr, recipient: addr }),
    args: (p) => [getAddress(p.token), getAddress(p.recipient)],
    describe: (p) => `COURFeeVault.setFeeRecipient(${p.token}, ${p.recipient})`,
  },
};

export const SAFE_ACTIONS = Object.keys(ACTIONS);

const safeNonceAbi = [
  { type: "function", name: "nonce", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const SAFE_TX_TYPES = {
  EIP712Domain: [
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type SafeTxResult = {
  action: string;
  summary: string;
  safeTxHash: Hex;
  nonce: string;
  typed: unknown; // the EIP-712 JSON for script/safe/signer.html
};

/**
 * Pure builder: encode an admin action into a Safe EIP-712 SafeTx JSON for a GIVEN
 * nonce (no network). The returned `typed` is byte-compatible with signer.html.
 */
export function encodeSafeTx(action: string, rawArgs: unknown, nonceBig: bigint): SafeTxResult {
  const def = ACTIONS[action];
  if (!def) throw new Error(`unknown action: ${action}`);
  const p = def.schema.parse(rawArgs);
  const data = encodeFunctionData({ abi: def.abi, functionName: def.fn, args: def.args(p) }) as Hex;

  const typed = {
    types: SAFE_TX_TYPES,
    primaryType: "SafeTx",
    domain: { chainId: CHAIN_ID, verifyingContract: SAFE },
    message: {
      to: def.target,
      value: "0",
      data,
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: ZERO,
      refundReceiver: ZERO,
      nonce: nonceBig.toString(),
    },
  };

  const safeTxHash = hashTypedData({
    domain: { chainId: CHAIN_ID, verifyingContract: SAFE },
    types: { SafeTx: SAFE_TX_TYPES.SafeTx },
    primaryType: "SafeTx",
    message: {
      to: def.target,
      value: 0n,
      data,
      operation: 0,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: ZERO,
      refundReceiver: ZERO,
      nonce: nonceBig,
    },
  });

  return { action, summary: def.describe(p), safeTxHash, nonce: nonceBig.toString(), typed };
}

/**
 * Build a Safe SafeTx JSON for an admin action, reading the Safe nonce on-chain.
 * The returned `typed` is byte-compatible with script/safe/signer.html.
 */
export async function buildSafeTx(action: string, rawArgs: unknown): Promise<SafeTxResult> {
  const nonceBig = (await serverClient.readContract({
    address: SAFE,
    abi: safeNonceAbi,
    functionName: "nonce",
  })) as bigint;
  return encodeSafeTx(action, rawArgs, nonceBig);
}
