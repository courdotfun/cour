import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { getAddress, type Address } from 'viem';

const __dirname = dirname(fileURLToPath(import.meta.url));
const monitorRoot = resolve(__dirname, '..');
const repoRoot = resolve(monitorRoot, '..');

// Load monitor/.env if present (does not override real environment variables).
loadDotenv({ path: resolve(monitorRoot, '.env') });

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function num(name: string, fallback: number): number {
  const v = env(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export interface Deployment {
  chainId: number;
  network: string;
  startBlock: number;
  deployer: Address;
  treasury: Address;
  factory: Address;
  feeVault: Address;
  hook: Address;
  router: Address;
  priceReader: Address;
  nvda: Address;
  usdg: Address;
  weth: Address;
  safeMultisig: Address | null;
  safeOwners: Address[];
}

function loadDeployment(): Deployment {
  const file = env('DEPLOYMENT_FILE') ?? resolve(repoRoot, 'deployments/4663.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const addr = (k: string): Address => getAddress(String(raw[k]));
  const safe = (raw.safe ?? {}) as { owners?: unknown };
  const safeOwners = Array.isArray(safe.owners)
    ? (safe.owners as unknown[]).map((o) => getAddress(String(o)))
    : [];
  const safeMultisig = raw.safeMultisig ? getAddress(String(raw.safeMultisig)) : null;
  return {
    safeMultisig,
    safeOwners,
    chainId: Number(raw.chainId),
    network: String(raw.network ?? 'unknown'),
    startBlock: Number(raw.startBlock ?? raw.block ?? 0),
    deployer: addr('deployer'),
    treasury: addr('treasury'),
    factory: addr('factory'),
    feeVault: addr('feeVault'),
    hook: addr('hook'),
    router: addr('router'),
    priceReader: addr('priceReader'),
    nvda: addr('nvda'),
    usdg: addr('usdg'),
    weth: addr('weth'),
  };
}

export const deployment = loadDeployment();

export const config = {
  deployment,

  // --- RPC / chain ---
  rpcUrl: env('MONITOR_RPC_URL'),
  pollIntervalMs: num('POLL_INTERVAL_MS', 12_000),

  // --- health loop ---
  healthIntervalMs: num('HEALTH_INTERVAL_MS', 60_000),
  // Deployer ETH balance threshold (in ETH) below which we alert.
  deployerMinEth: num('DEPLOYER_MIN_ETH', 0.05),
  // Safe-owner ETH balance threshold (in ETH). Owners need gas to execute Safe txs
  // (incident pause, config) once ownership is the Safe. Alert below this.
  ownerMinEth: num('OWNER_MIN_ETH', 0.001),
  // Percent deviation in stockUsd(NVDA) between two consecutive reads that triggers an alert.
  stockDeviationPct: num('STOCK_DEVIATION_PCT', 10),
  // FeeTaken stockFee (in whole stock units) above which we flag it as "large/anomalous".
  largeFeeStock: num('LARGE_FEE_STOCK', 1000),

  // --- alerting ---
  telegramBotToken: env('TELEGRAM_BOT_TOKEN'),
  telegramChatId: env('TELEGRAM_CHAT_ID'),
  // Suppress identical alerts seen again within this window (ms).
  alertDedupeMs: num('ALERT_DEDUPE_MS', 300_000),

  // --- http server ---
  httpPort: num('HTTP_PORT', 8080),
  httpHost: env('HTTP_HOST') ?? '127.0.0.1',
} as const;

export function assertRpc(): string {
  if (!config.rpcUrl) {
    throw new Error('MONITOR_RPC_URL is not set. Export it before starting the monitor.');
  }
  return config.rpcUrl;
}
