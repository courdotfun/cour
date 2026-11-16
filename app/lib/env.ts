// Public (client-exposed) config. Only NEXT_PUBLIC_* values appear in the browser
// bundle — never secrets. Server-only values live in app/lib/server/*.
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";

export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

// The browser reads indexer data through our same-origin proxy (/api/ix/*),
// so no indexer URL is exposed client-side. Server route handlers use INDEXER_URL.
export const INDEXER_PROXY_BASE =
  process.env.NEXT_PUBLIC_INDEXER_PROXY ?? "/api/ix";
