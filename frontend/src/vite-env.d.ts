/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_INDEXER_URL?: string;
  readonly VITE_WC_PROJECT_ID?: string;
  // NOTE: no VITE_PINATA_JWT — IPFS upload is server-side only (api/upload.ts).
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Globals exposed by / shared with the legacy in-page design script.
interface Window {
  COUR_LIVE?: boolean;
  COUR_SIM?: { dt: number; t: number };
  COUR_PX?: Record<string, number>;
  COUR_WALLET?: {
    connect: (via?: string) => Promise<{ addr: string; via?: string }>;
    disconnect: () => Promise<void>;
    send: (asset: string, to: string, amount: number) => Promise<{ hash: string }>;
    swap: (from: string, to: string, amount: number) => Promise<{ hash: string }>;
    [k: string]: any;
  };
  COUR?: any;
  COUR_W?: any;
  refreshAll?: () => void;
  renderHeader?: () => void;
  ethereum?: any;
}
