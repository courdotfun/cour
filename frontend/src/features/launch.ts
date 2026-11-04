// Launch a new COUR token via factory.createToken(CreateParams).
// Allowlist is ENABLED on-chain: the UI must gate the launch button on
// isLaunchAllowed() before calling this.
import { erc20Abi, factoryAbi } from "../chain/abi";
import { deployment } from "../chain/deployment";
import { publicClient } from "../chain/client";
import { ensureChain, getWallet, requireWalletClient } from "../chain/wallet";
import { erc20Allowance } from "../data/onchain";
import type { Hex } from "../data/types";

export interface CreateParams {
  name: string;
  symbol: string;
  metadataURI: string;
  stock: Hex;
  creatorFeeBps: number; // 100..1000 (1%..10%)
  creatorMode: number; // 0..3
  feeRecipient: Hex;
  initialBuyStock: bigint; // raw stock units, <= 50% supply
  minInitialTokens: bigint;
  salt: Hex; // bytes32
}

export function randomSalt(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex;
}

export interface LaunchResult {
  txHash: Hex;
  token: Hex;
  curve: Hex;
}

export async function createToken(params: CreateParams): Promise<LaunchResult> {
  const { address } = getWallet();
  if (!address) throw new Error("Connect a wallet first");

  // The initial buy is paid in the STOCK token; approve the factory if needed.
  if (params.initialBuyStock > 0n) {
    const current = await erc20Allowance(params.stock, address, deployment.factory);
    if (current < params.initialBuyStock) {
      await ensureChain();
      const wc0 = requireWalletClient();
      const ah = await wc0.writeContract({
        address: params.stock,
        abi: erc20Abi,
        functionName: "approve",
        args: [deployment.factory, params.initialBuyStock],
        account: address,
        chain: null,
      });
      await publicClient.waitForTransactionReceipt({ hash: ah });
    }
  }

  await ensureChain();
  const wc = requireWalletClient();
  const tuple = [
    params.name,
    params.symbol,
    params.metadataURI,
    params.stock,
    params.creatorFeeBps,
    params.creatorMode,
    params.feeRecipient,
    params.initialBuyStock,
    params.minInitialTokens,
    params.salt,
  ] as const;

  // Simulate first so we can surface the returned (token, curve) addresses and
  // catch reverts (e.g. allowlist, invalid fee) before sending.
  const { result } = await publicClient.simulateContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "createToken",
    args: [tuple],
    account: address,
  });
  const [token, curve] = result as [Hex, Hex];

  const hash = await wc.writeContract({
    address: deployment.factory,
    abi: factoryAbi,
    functionName: "createToken",
    args: [tuple],
    account: address,
    chain: null,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { txHash: hash, token, curve };
}

// ---- IPFS image upload (Pinata) -------------------------------------------
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT as string | undefined;

export function pinataConfigured(): boolean {
  return !!PINATA_JWT;
}

export async function uploadImageToIpfs(file: File): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error("Image upload unavailable: VITE_PINATA_JWT is not set.");
  }
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Pinata upload failed (${res.status})`);
  const data = (await res.json()) as { IpfsHash: string };
  return `ipfs://${data.IpfsHash}`;
}
