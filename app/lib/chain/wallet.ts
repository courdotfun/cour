import {
  createWalletClient,
  custom,
  type WalletClient,
  type EIP1193Provider,
} from "viem";
import { robinhoodChain, CHAIN_ID } from "./client";

// --- EIP-6963 multi-injected provider discovery -----------------------------
export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

const discovered = new Map<string, EIP6963ProviderDetail>();
const listeners = new Set<(providers: EIP6963ProviderDetail[]) => void>();

function emit() {
  const list = [...discovered.values()];
  for (const l of listeners) l(list);
}

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event: Event) => {
    const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
    if (detail?.info?.uuid) {
      discovered.set(detail.info.uuid, detail);
      emit();
    }
  });
  // Ask already-loaded wallets to announce themselves.
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function listProviders(): EIP6963ProviderDetail[] {
  const list = [...discovered.values()];
  // Legacy fallback: a lone window.ethereum that never announced (EIP-6963).
  const eth = (window as any).ethereum as EIP1193Provider | undefined;
  if (eth && !list.some((p) => p.provider === eth)) {
    list.push({
      info: {
        uuid: "legacy-window-ethereum",
        name: (eth as any).isMetaMask ? "MetaMask" : "Injected Wallet",
        icon: "",
        rdns: "legacy",
      },
      provider: eth,
    });
  }
  return list;
}

export function onProviders(cb: (p: EIP6963ProviderDetail[]) => void): () => void {
  listeners.add(cb);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  cb(listProviders());
  return () => listeners.delete(cb);
}

// --- Connection state -------------------------------------------------------
export interface WalletState {
  address: `0x${string}` | null;
  chainId: number | null;
  provider: EIP1193Provider | null;
  walletClient: WalletClient | null;
}

const state: WalletState = {
  address: null,
  chainId: null,
  provider: null,
  walletClient: null,
};

const stateListeners = new Set<(s: WalletState) => void>();
function emitState() {
  for (const l of stateListeners) l({ ...state });
}
export function onWalletChange(cb: (s: WalletState) => void): () => void {
  stateListeners.add(cb);
  cb({ ...state });
  return () => stateListeners.delete(cb);
}
export function getWallet(): WalletState {
  return { ...state };
}

function bindProviderEvents(provider: EIP1193Provider) {
  provider.on?.("accountsChanged", (accounts: unknown) => {
    const a = (accounts as string[])[0] as `0x${string}` | undefined;
    state.address = a ?? null;
    if (!a) {
      state.walletClient = null;
      state.provider = null;
    }
    emitState();
  });
  provider.on?.("chainChanged", (cid: unknown) => {
    state.chainId = Number(cid as string);
    emitState();
  });
}

export async function connect(provider: EIP1193Provider): Promise<WalletState> {
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const address = accounts[0] as `0x${string}`;
  const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
  state.address = address;
  state.chainId = Number(chainIdHex);
  state.provider = provider;
  state.walletClient = createWalletClient({
    account: address,
    chain: robinhoodChain,
    transport: custom(provider),
  });
  bindProviderEvents(provider);
  emitState();
  return { ...state };
}

export function disconnect() {
  state.address = null;
  state.walletClient = null;
  state.provider = null;
  state.chainId = null;
  emitState();
}

// Prompt the wallet to add / switch to Robinhood Chain.
export async function ensureChain(): Promise<void> {
  const provider = state.provider;
  if (!provider) throw new Error("No wallet connected");
  if (state.chainId === CHAIN_ID) return;
  const hexId = "0x" + CHAIN_ID.toString(16);
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err: any) {
    // 4902 = chain not added.
    if (err?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: robinhoodChain.name,
            nativeCurrency: robinhoodChain.nativeCurrency,
            rpcUrls: robinhoodChain.rpcUrls.default.http,
            blockExplorerUrls: [robinhoodChain.blockExplorers!.default.url],
          },
        ],
      });
    } else {
      throw err;
    }
  }
  state.chainId = CHAIN_ID;
  emitState();
}

export function requireWalletClient(): WalletClient {
  if (!state.walletClient || !state.address) {
    throw new Error("Connect a wallet first");
  }
  return state.walletClient;
}
