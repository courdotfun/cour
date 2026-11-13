// WalletConnect v2 provider (lazy-loaded). Returns an EIP-1193 provider that
// plugs into the same wallet adapter as injected (EIP-6963) wallets. The
// `@walletconnect/ethereum-provider` package is dynamically imported so it is
// only downloaded when the user actually picks WalletConnect, keeping the main
// bundle small. Requires VITE_WC_PROJECT_ID (Reown/WalletConnect Cloud project).
import type { EIP1193Provider } from "viem";
import { robinhoodChain, CHAIN_ID } from "./client";

let cached: EIP1193Provider | null = null;

export function wcConfigured(): boolean {
  return !!import.meta.env.VITE_WC_PROJECT_ID;
}

export async function getWalletConnectProvider(): Promise<EIP1193Provider> {
  const projectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;
  if (!projectId) {
    throw new Error("WalletConnect is not configured on this deployment.");
  }
  if (cached) return cached;
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const rpc = robinhoodChain.rpcUrls.default.http[0];
  const provider = await EthereumProvider.init({
    projectId,
    // Robinhood Chain is not a well-known chain; keep it optional so wallets that
    // don't pre-know it can still pair (they add it on first request).
    chains: [CHAIN_ID],
    optionalChains: [CHAIN_ID],
    rpcMap: { [CHAIN_ID]: rpc },
    showQrModal: true,
    metadata: {
      name: "COUR",
      description: "Launch & trade tokenized-stock tokens 24/7 on Robinhood Chain",
      url: "https://cour.fun",
      icons: ["https://cour.fun/favicon.ico"],
    },
  });
  cached = provider as unknown as EIP1193Provider;
  return cached;
}

// Establish a session (opens the QR modal) if not already connected.
export async function connectWalletConnect(): Promise<EIP1193Provider> {
  const provider = await getWalletConnectProvider();
  const p = provider as unknown as { accounts?: string[]; enable: () => Promise<string[]> };
  if (!p.accounts || p.accounts.length === 0) {
    await p.enable();
  }
  return provider;
}
