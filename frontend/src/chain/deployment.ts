// Canonical COUR deployment on Robinhood Chain (chainId 4663).
// Mirrors deployments/4663.json from the repo root (copied to public/deployment.json
// at build time). Addresses are the final "audit-freeze-v1" deploy.
import deploymentJson from "../../public/deployment.json";

export interface Deployment {
  chainId: number;
  network: string;
  factory: `0x${string}`;
  feeVault: `0x${string}`;
  hook: `0x${string}`;
  router: `0x${string}`;
  priceReader: `0x${string}`;
  curveImpl: `0x${string}`;
  graduationImpl: `0x${string}`;
  poolManager: `0x${string}`;
  positionManager: `0x${string}`;
  usdg: `0x${string}`;
  weth: `0x${string}`;
  nvda: `0x${string}`;
  nvdaUsdgPool: `0x${string}`;
  allowlistEnabled: boolean;
  owner: `0x${string}`;
  params: {
    startMcUsd: number;
    gradMcUsd: number;
    minRefLiqUsd: number;
    launchFee: number;
    minBuybackUsd: number;
  };
}

export const deployment = deploymentJson as unknown as Deployment;

// Extra well-known addresses referenced by the UI that are not part of the core
// deployment JSON (external Uniswap v3 router + a public test token).
export const extraAddresses = {
  // Uniswap SwapRouter02 used for ETH<->stock and stock buy/sell.
  v3SwapRouter02: "0xCaf681a66D020601342297493863E78C959E5cb2" as `0x${string}`,
  // CSMOKE: a live COUR test token so the UI shows real data out of the box.
  csmoke: "0x9662F473D5810aa832ed4282bCB0b0F3348fA7bC" as `0x${string}`,
} as const;

export const EXPLORER_URL = "https://robin.etherscan.io";

export function explorerAddress(addr: string): string {
  return `${EXPLORER_URL}/address/${addr}`;
}
export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}
export function explorerToken(addr: string): string {
  return `${EXPLORER_URL}/token/${addr}`;
}

// The burn address graduation proof checks against.
export const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD" as `0x${string}`;
