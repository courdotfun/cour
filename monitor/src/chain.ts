import { createPublicClient, defineChain, fallback, http, type PublicClient } from 'viem';
import { assertRpc, config } from './config.js';

export const courChain = defineChain({
  id: config.deployment.chainId,
  name: config.deployment.network,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [assertRpc()] } },
});

let client: PublicClient | undefined;

export function publicClient(): PublicClient {
  if (!client) {
    const url = assertRpc();
    client = createPublicClient({
      chain: courChain,
      // fallback of a single transport still gives us viem's automatic retry/backoff.
      transport: fallback([http(url, { batch: true, timeout: 20_000, retryCount: 3 })]),
      pollingInterval: config.pollIntervalMs,
    });
  }
  return client;
}
